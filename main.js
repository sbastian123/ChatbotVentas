// Importar las bibliotecas necesarias
const express = require('express');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai'); // Correcta importación de OpenAI
const funcion = require('./funcion'); // Tu archivo de funciones personalizadas
const dotenv = require('dotenv'); // Cargar variables de entorno

// Cargar las variables de entorno
dotenv.config();

// Configurar la clave de API de OpenAI desde las variables de entorno
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
    throw new Error("Error: OPENAI_API_KEY no está definido en el entorno.");
}

// Crear una instancia del cliente OpenAI
const client = new OpenAI({
  apiKey: OPENAI_API_KEY, // Usamos la variable de entorno para la API key
});

// ID del asistente ya creado
const assistantId = 'asst_ImIOaaPcuQ8uUNar8tR1nREW';

// Inicializar el framework Express
const app = express();
app.use(bodyParser.json());

// Endpoint para iniciar una nueva conversación
app.get('/start', async (req, res) => {
    try {
        // Crear un nuevo hilo (thread) de conversación
        const thread = await client.chat.createThread();
        console.log('Nueva conversación iniciada con thread ID:', thread.id);
        res.json({ thread_id: thread.id }); // Devolver el ID del hilo como respuesta
    } catch (error) {
        console.error('Error al iniciar la conversación:', error.message);
        res.status(500).json({ error: 'Error al iniciar la conversación.' }); // Respuesta de error
    }
});

// Endpoint para enviar un mensaje
app.post('/chat', async (req, res) => {
    const { thread_id: threadId, message } = req.body; // Extraer datos

    if (!threadId) {
        console.error('Error: Falta thread_id en /chat');
        return res.status(400).json({ error: 'Falta thread_id.' });
    }

    try {
        // Enviar un mensaje al hilo
        await client.chat.addMessage({ threadId, role: 'user', content: message || '' });

        // Crear un "run" en el hilo usando el `assistantId` proporcionado
        const run = await client.chat.startRun({ threadId, assistantId });

        console.log('Run iniciado con ID:', run.id);
        res.json({ run_id: run.id });
    } catch (error) {
        console.error('Error en /chat:', error.message);
        res.status(500).json({ error: 'Error al procesar el mensaje.' }); // Respuesta de error
    }
});

// Endpoint para revisar el estado
app.post('/check', async (req, res) => {
    const { thread_id: threadId, run_id: runId } = req.body; // Extraer datos

    if (!threadId || !runId) {
        console.error('Error: Faltan thread_id o run_id en /check');
        return res.status(400).json({ error: 'Faltan thread_id o run_id.' });
    }

    const startTime = Date.now(); // Obtener la hora de inicio
    try {
        while (Date.now() - startTime < 8000) { // Bucle con límite de 8 segundos
            const runStatus = await client.chat.getRunStatus({ threadId, runId });

            console.log('Estado del run:', runStatus.status);

            if (runStatus.status === 'completed') {
                const messages = await client.chat.getMessages({ threadId });
                const messageContent = messages.data[0].content;

                // Eliminar anotaciones del mensaje si existen
                if (messageContent.annotations) {
                    messageContent.annotations.forEach(annotation => {
                        messageContent.value = messageContent.value.replace(annotation.text, '');
                    });
                }

                console.log('Run completado, devolviendo respuesta');
                return res.json({ response: messageContent.value, status: 'completed' });
            }

            if (runStatus.status === 'requires_action') {
                console.log('Acción requerida...');
                for (const toolCall of runStatus.required_action.submit_tool_outputs.tool_calls) {
                    if (toolCall.function.name === 'create_lead') {
                        const args = JSON.parse(toolCall.function.arguments);
                        const output = await funcion.createLead(args.name, args.phone); // Creación de un "lead"
                        await client.chat.submitToolOutput({
                            threadId,
                            runId,
                            toolOutputs: [{
                                toolCallId: toolCall.id,
                                output: JSON.stringify(output)
                            }]
                        });
                    }
                }
            }

            await new Promise(resolve => setTimeout(resolve, 1000)); // Espera de 1 segundo entre verificaciones
        }

        console.log('Run superó el tiempo límite');
        res.json({ response: 'timeout' }); // Responder con timeout
    } catch (error) {
        console.error('Error en /check:', error.message); // Manejar errores
        res.status(500).json({ error: 'Error al verificar el estado del run.' }); // Respuesta de error
    }
});

// Iniciar el servidor en el puerto 3000
const PORT = 3000; // Establecer el puerto a 3000
app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en http://0.0.0.0:${PORT}`); // Log de inicio del servidor
});
