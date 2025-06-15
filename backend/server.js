const express = require('express');
const multer = require('multer');
const pdf = require('pdf-parse');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed!'), false);
        }
    },
    limits: {
        fileSize: 50 * 1024 * 1024 // Increased to 50MB limit
    }
});

// In-memory storage for PDF content and summaries
const pdfStorage = new Map();

// Groq API configuration with multiple fallback models
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Multiple models for fallback and load balancing
const GROQ_MODELS = [
    'llama-3.3-70b-versatile',
    'llama-3.2-90b-text-preview',
    'llama-3.1-70b-versatile',
    'llama-3-70b-8192',
    'mixtral-8x7b-32768',
    'gemma2-9b-it'
];

// Rate limiting and retry configuration
const RATE_LIMIT_CONFIG = {
    maxRetries: 5,
    baseDelay: 1000, // 1 second
    maxDelay: 60000, // 1 minute
    backoffMultiplier: 2
};

// Request queue for managing rate limits
class RequestQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.lastRequestTime = 0;
        this.minInterval = 100; // Minimum 100ms between requests
    }

    async add(requestFunction) {
        return new Promise((resolve, reject) => {
            this.queue.push({ requestFunction, resolve, reject });
            this.processQueue();
        });
    }

    async processQueue() {
        if (this.processing || this.queue.length === 0) return;
        
        this.processing = true;
        
        while (this.queue.length > 0) {
            const { requestFunction, resolve, reject } = this.queue.shift();
            
            try {
                // Ensure minimum interval between requests
                const now = Date.now();
                const timeSinceLastRequest = now - this.lastRequestTime;
                if (timeSinceLastRequest < this.minInterval) {
                    await this.sleep(this.minInterval - timeSinceLastRequest);
                }
                
                const result = await requestFunction();
                this.lastRequestTime = Date.now();
                resolve(result);
            } catch (error) {
                reject(error);
            }
            
            // Small delay between requests
            await this.sleep(50);
        }
        
        this.processing = false;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

const requestQueue = new RequestQueue();

// Enhanced helper function to call Groq API with retry logic and model fallback
async function callGroqAPI(messages, maxTokens = 10000, modelIndex = 0) {
    const makeRequest = async () => {
        let lastError;
        
        // Try each model
        for (let i = modelIndex; i < GROQ_MODELS.length; i++) {
            const model = GROQ_MODELS[i];
            
            // Retry logic for each model
            for (let attempt = 0; attempt <= RATE_LIMIT_CONFIG.maxRetries; attempt++) {
                try {
                    console.log(`Attempting request with model: ${model} (attempt ${attempt + 1})`);
                    
                    const response = await axios.post(GROQ_API_URL, {
                        model: model,
                        messages: messages,
                        max_tokens: maxTokens,
                        temperature: 0.3,
                        top_p: 0.9
                    }, {
                        headers: {
                            'Authorization': `Bearer ${GROQ_API_KEY}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 30000 // 30 second timeout
                    });

                    console.log(`✅ Success with model: ${model}`);
                    return response.data.choices[0].message.content;
                    
                } catch (error) {
                    lastError = error;
                    const errorData = error.response?.data?.error;
                    
                    if (errorData?.type === 'tokens' && errorData?.code === 'rate_limit_exceeded') {
                        // Extract wait time from error message
                        const waitTimeMatch = errorData.message.match(/try again in ([\d.]+)s/);
                        let waitTime = waitTimeMatch ? parseFloat(waitTimeMatch[1]) * 1000 : 
                                      RATE_LIMIT_CONFIG.baseDelay * Math.pow(RATE_LIMIT_CONFIG.backoffMultiplier, attempt);
                        
                        waitTime = Math.min(waitTime, RATE_LIMIT_CONFIG.maxDelay);
                        
                        console.log(`⏱️  Rate limit hit for ${model}. Waiting ${waitTime/1000}s before retry...`);
                        
                        if (attempt < RATE_LIMIT_CONFIG.maxRetries) {
                            await new Promise(resolve => setTimeout(resolve, waitTime));
                            continue; // Retry with same model
                        } else {
                            console.log(`❌ Max retries reached for ${model}. Trying next model...`);
                            break; // Try next model
                        }
                    } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                        console.log(`⏱️  Timeout for ${model}. Retrying...`);
                        if (attempt < RATE_LIMIT_CONFIG.maxRetries) {
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            continue;
                        }
                    } else {
                        console.log(`❌ Error with ${model}:`, errorData?.message || error.message);
                        break; // Try next model for other errors
                    }
                }
            }
        }
        
        throw new Error(`All models failed. Last error: ${lastError.response?.data?.error?.message || lastError.message}`);
    };

    return requestQueue.add(makeRequest);
}

// Helper function to chunk text for processing with adaptive sizing
function chunkText(text, maxChunkSize = 4000) {
    const chunks = [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    let currentChunk = '';

    for (const sentence of sentences) {
        const trimmedSentence = sentence.trim();
        if (!trimmedSentence) continue;
        
        const potentialChunk = currentChunk + (currentChunk ? '. ' : '') + trimmedSentence;
        
        if (potentialChunk.length > maxChunkSize && currentChunk) {
            chunks.push(currentChunk.trim() + '.');
            currentChunk = trimmedSentence;
        } else {
            currentChunk = potentialChunk;
        }
    }

    if (currentChunk) {
        chunks.push(currentChunk.trim() + (currentChunk.endsWith('.') ? '' : '.'));
    }

    return chunks.length > 0 ? chunks : [text]; // Fallback to original text if no sentences found
}

// Helper function to clean and preprocess text
function preprocessText(text) {
    return text
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .replace(/\n+/g, '\n') // Replace multiple newlines with single newline
        .replace(/[^\w\s\n.,!?;:()-]/g, '') // Remove special characters except basic punctuation
        .trim();
}

// Helper function to estimate token count (rough approximation)
function estimateTokens(text) {
    // Rough approximation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
}

// Routes

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'PDF Processing Backend is running',
        groqModels: GROQ_MODELS,
        queueLength: requestQueue.queue.length
    });
});

// Upload PDF endpoint
app.post('/api/upload-pdf', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }

        if (!GROQ_API_KEY) {
            return res.status(500).json({ error: 'Groq API key not configured' });
        }

        // Parse PDF
        const pdfBuffer = fs.readFileSync(req.file.path);
        const pdfData = await pdf(pdfBuffer);
        
        // Clean and preprocess the extracted text
        const cleanedText = preprocessText(pdfData.text);
        
        if (!cleanedText || cleanedText.length < 100) {
            return res.status(400).json({ error: 'PDF contains insufficient text content' });
        }

        // Store PDF content with metadata
        const pdfId = req.file.filename.replace('.pdf', '');
        pdfStorage.set(pdfId, {
            originalName: req.file.originalname,
            text: cleanedText,
            uploadDate: new Date(),
            pages: pdfData.numpages,
            summary: null,
            estimatedTokens: estimateTokens(cleanedText)
        });

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        res.json({
            success: true,
            message: 'PDF uploaded and processed successfully',
            pdfId: pdfId,
            metadata: {
                originalName: req.file.originalname,
                pages: pdfData.numpages,
                textLength: cleanedText.length,
                estimatedTokens: estimateTokens(cleanedText),
                uploadDate: new Date()
            }
        });

    } catch (error) {
        console.error('Upload error:', error);
        
        // Clean up file if it exists
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({ 
            error: 'Failed to process PDF', 
            details: error.message 
        });
    }
});

// Generate summary endpoint with enhanced error handling
app.post('/api/generate-summary/:pdfId', async (req, res) => {
    try {
        const { pdfId } = req.params;
        const { summaryType = 'comprehensive' } = req.body;
        
        if (!pdfStorage.has(pdfId)) {
            return res.status(404).json({ error: 'PDF not found' });
        }

        const pdfData = pdfStorage.get(pdfId);
        
        // Check if summary already exists
        if (pdfData.summary && pdfData.summary[summaryType]) {
            return res.json({
                success: true,
                summary: pdfData.summary[summaryType],
                fromCache: true,
                pdfInfo: {
                    originalName: pdfData.originalName,
                    pages: pdfData.pages
                }
            });
        }

        // Adaptive chunking based on text length
        const textLength = pdfData.text.length;
        let chunkSize = 3000; // Conservative default
        
        if (textLength < 10000) chunkSize = 5000;
        else if (textLength < 50000) chunkSize = 4000;
        else chunkSize = 3000; // Large documents get smaller chunks
        
        const chunks = chunkText(pdfData.text, chunkSize);
        console.log(`📄 Processing ${chunks.length} chunks for ${pdfData.originalName}`);
        
        let summaries = [];

        // Get summary prompt based on type
        const getSummaryPrompt = (type, text, isChunk = false) => {
            const basePrompt = isChunk ? 
                "Summarize this document section concisely:" : 
                "Create a cohesive final summary from these sections:";
            
            switch (type) {
                case 'brief':
                    return `${basePrompt} Provide a brief 2-3 paragraph summary focusing on main points.\n\nText: ${text}`;
                case 'bullet-points':
                    return `${basePrompt} Provide key points as bullet points.\n\nText: ${text}`;
                default: // comprehensive
                    return `${basePrompt} Provide a detailed summary covering all major topics.\n\nText: ${text}`;
            }
        };

        // Process each chunk with progress tracking
        for (let i = 0; i < chunks.length; i++) {
            console.log(`📝 Processing chunk ${i + 1}/${chunks.length}...`);
            
            const messages = [
                {
                    role: 'system',
                    content: 'You are an expert document analyst. Provide clear, accurate summaries.'
                },
                {
                    role: 'user',
                    content: getSummaryPrompt(summaryType, chunks[i], true)
                }
            ];

            try {
                const chunkSummary = await callGroqAPI(messages, 1000);
                summaries.push(chunkSummary);
                console.log(`✅ Chunk ${i + 1} completed`);
            } catch (error) {
                console.error(`❌ Failed to process chunk ${i + 1}:`, error.message);
                // Continue with other chunks even if one fails
                summaries.push(`[Error processing section ${i + 1}]`);
            }
        }

        // Combine summaries if multiple chunks
        let finalSummary;
        if (summaries.length === 1) {
            finalSummary = summaries[0];
        } else {
            const validSummaries = summaries.filter(s => !s.startsWith('[Error'));
            if (validSummaries.length === 0) {
                throw new Error('Failed to process any chunks successfully');
            }
            
            const combinedSummaries = validSummaries.join('\n\n---\n\n');
            const messages = [
                {
                    role: 'system',
                    content: 'Create a unified summary from these sections. Be comprehensive yet concise.'
                },
                {
                    role: 'user',
                    content: getSummaryPrompt(summaryType, combinedSummaries, false)
                }
            ];

            finalSummary = await callGroqAPI(messages, 1500);
        }

        // Store the summary
        if (!pdfData.summary) {
            pdfData.summary = {};
        }
        pdfData.summary[summaryType] = finalSummary;
        pdfStorage.set(pdfId, pdfData);

        console.log(`🎉 Summary generation completed for ${pdfData.originalName}`);

        res.json({
            success: true,
            summary: finalSummary,
            summaryType: summaryType,
            fromCache: false,
            chunksProcessed: chunks.length,
            pdfInfo: {
                originalName: pdfData.originalName,
                pages: pdfData.pages
            }
        });

    } catch (error) {
        console.error('Summary generation error:', error);
        res.status(500).json({ 
            error: 'Failed to generate summary', 
            details: error.message 
        });
    }
});

// Query PDF endpoint with enhanced handling
app.post('/api/query-pdf/:pdfId', async (req, res) => {
    try {
        const { pdfId } = req.params;
        const { question, context = 'full' } = req.body;
        
        if (!question) {
            return res.status(400).json({ error: 'Question is required' });
        }

        if (!pdfStorage.has(pdfId)) {
            return res.status(404).json({ error: 'PDF not found' });
        }

        const pdfData = pdfStorage.get(pdfId);
        
        // Determine context for the query
        let contextText;
        if (context === 'summary' && pdfData.summary && pdfData.summary.comprehensive) {
            contextText = pdfData.summary.comprehensive;
        } else {
            // Use full text but limit size for API
            contextText = pdfData.text.length > 12000 ? 
                pdfData.text.substring(0, 12000) + "..." : 
                pdfData.text;
        }

        const messages = [
            {
                role: 'system',
                content: `You are a helpful assistant that answers questions based on document content. If information isn't in the document, clearly state that.`
            },
            {
                role: 'user',
                content: `Document: ${contextText}\n\nQuestion: ${question}\n\nAnswer based on the document:`
            }
        ];

        const answer = await callGroqAPI(messages, 1000);

        res.json({
            success: true,
            question: question,
            answer: answer,
            contextUsed: context,
            pdfInfo: {
                originalName: pdfData.originalName,
                pages: pdfData.pages
            }
        });

    } catch (error) {
        console.error('Query error:', error);
        res.status(500).json({ 
            error: 'Failed to process query', 
            details: error.message 
        });
    }
});

// Get PDF list endpoint
app.get('/api/pdfs', (req, res) => {
    const pdfs = Array.from(pdfStorage.entries()).map(([id, data]) => ({
        id,
        originalName: data.originalName,
        pages: data.pages,
        uploadDate: data.uploadDate,
        textLength: data.text.length,
        estimatedTokens: data.estimatedTokens,
        hasSummary: !!data.summary
    }));

    res.json({
        success: true,
        pdfs: pdfs,
        queueLength: requestQueue.queue.length
    });
});

// Delete PDF endpoint
app.delete('/api/pdf/:pdfId', (req, res) => {
    const { pdfId } = req.params;
    
    if (!pdfStorage.has(pdfId)) {
        return res.status(404).json({ error: 'PDF not found' });
    }

    pdfStorage.delete(pdfId);
    
    res.json({
        success: true,
        message: 'PDF deleted successfully'
    });
});

// Get API status endpoint
app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        status: {
            queueLength: requestQueue.queue.length,
            totalPdfs: pdfStorage.size,
            availableModels: GROQ_MODELS,
            rateLimitConfig: RATE_LIMIT_CONFIG
        }
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
        }
    }
    
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Available Groq models: ${GROQ_MODELS.join(', ')}`);
    console.log(`⚙️  Rate limit config: ${RATE_LIMIT_CONFIG.maxRetries} retries, ${RATE_LIMIT_CONFIG.baseDelay}ms base delay`);
    console.log('🌐 Available endpoints:');
    console.log('  - POST /api/upload-pdf - Upload a PDF file');
    console.log('  - POST /api/generate-summary/:pdfId - Generate summary');
    console.log('  - POST /api/query-pdf/:pdfId - Query the PDF content');
    console.log('  - GET /api/pdfs - List all uploaded PDFs');
    console.log('  - DELETE /api/pdf/:pdfId - Delete a PDF');
    console.log('  - GET /api/status - Get API status');
    console.log('  - GET /health - Health check');
});
