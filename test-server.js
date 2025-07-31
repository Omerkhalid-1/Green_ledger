const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// Basic middleware
app.use(express.static('public'));
app.use(express.json());

// Test route
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>🌿 Green Ledger - Test</title>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    text-align: center; 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 50px;
                }
                .container { 
                    background: rgba(255,255,255,0.1); 
                    padding: 40px; 
                    border-radius: 20px; 
                    display: inline-block;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🌿 Green Ledger Test Server</h1>
                <p>✅ Server is running successfully!</p>
                <p>Port: ${PORT}</p>
                <p>Time: ${new Date().toLocaleString()}</p>
                <hr>
                <p>If you can see this, your basic setup is working!</p>
                <p>Next step: Replace with full server.js</p>
            </div>
        </body>
        </html>
    `);
});

// Test API route
app.get('/api/test', (req, res) => {
    res.json({ 
        status: 'success', 
        message: 'API is working!',
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, () => {
    console.log('🎉 SUCCESS! Test server is running!');
    console.log(`🌐 Open your browser and go to: http://localhost:${PORT}`);
    console.log(`🔗 Test API at: http://localhost:${PORT}/api/test`);
    console.log('📁 Current directory:', __dirname);
});

// Error handling
process.on('uncaughtException', (error) => {
    console.error('❌ Error occurred:', error.message);
});

process.on('SIGINT', () => {
    console.log('\n👋 Server stopped by user');
    process.exit(0);
});