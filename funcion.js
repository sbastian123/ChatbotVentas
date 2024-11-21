const axios = require('axios');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const path = require('path');
require('dotenv').config();

// Configuración de Airtable y OpenAI
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Función para cargar y extraer contenido de todos los PDFs en la carpeta
async function loadPDFContents() {
    const pdfContents = {};
    const files = fs.readdirSync(__dirname).filter(file => file.endsWith('.pdf'));

    for (const file of files) {
        try {
            const pdfBuffer = fs.readFileSync(path.join(__dirname, file));
            const data = await pdfParse(pdfBuffer);
            pdfContents[file] = data.text.replace(/\s+/g, ' ').toLowerCase();
            console.log(`Contenido del PDF "${file}" cargado y limpiado.`);
        } catch (error) {
            console.error(`Error al cargar el PDF "${file}":`, error);
        }
    }

    return pdfContents;
}

// Función para obtener respuesta de OpenAI basada en la pregunta y el contenido de los PDFs
async function getChatGPTResponse(question, pdfContents) {
    let contentFromPDFs = "";

    for (const [fileName, content] of Object.entries(pdfContents)) {
        contentFromPDFs += `Contenido de ${fileName}:\n${content}\n\n`;
    }

    const prompt = `
Pregunta: "${question}"\n\n
Contexto de los documentos:\n${contentFromPDFs}\n\n
Instrucciones: Responde a la pregunta usando solo la información relevante de los documentos.
    `;

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: "system", content: "Eres un asesor experto que responde a preguntas específicas usando contenido relevante de los documentos proporcionados." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 1000,
                temperature: 0.3
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data.choices[0].message.content.trim();
    } catch (error) {
        console.error("Error al obtener respuesta de OpenAI:", error.message);
        return "Lo siento, hubo un error al procesar tu solicitud.";
    }
}

// Función para almacenar información en Airtable
async function saveToAirtable(name, phone, question, response, notes) {
    const url = 'https://api.airtable.com/v0/appkLKXN9xGUlC7BA/Accelerator%20Leads';
    const headers = {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
    };
    const data = {
        records: [{
            fields: {
                Nombre: name,
                Número: phone,
                Pregunta: question,
                Respuesta: response,
                Notas: notes
            }
        }]
    };

    try {
        const response = await axios.post(url, data, { headers });
        console.log("Información guardada en Airtable correctamente.");
        return response.data;
    } catch (error) {
        console.error("Error al guardar en Airtable:", error.response.data);
    }
}

// Función para analizar las respuestas usando OpenAI
async function analyzeResponses(question, response) {
    const prompt = `
Pregunta: "${question}"\n
Respuesta proporcionada: "${response}"\n
Instrucciones: Analiza la calidad de esta respuesta e identifica si cumple con los criterios esperados basados en el contexto del usuario.
    `;

    try {
        const analysis = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: "system", content: "Eres un asistente experto en análisis de respuestas." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 500,
                temperature: 0.5
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return analysis.data.choices[0].message.content.trim();
    } catch (error) {
        console.error("Error al analizar las respuestas:", error.message);
        return "No se pudo analizar la respuesta.";
    }
}

// Exportar las funciones para que puedan ser usadas en otros módulos
module.exports = {
    loadPDFContents,
    getChatGPTResponse,
    saveToAirtable,
    analyzeResponses
};
