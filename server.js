const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');

const app = express();
const PORT = process.env.PORT || 3000;

// Create logs directory if it doesn't exist
const LOGS_DIR = path.join(__dirname, 'logs');

// Logging utility functions
function getCurrentTimestamp() {
    return moment().format('YYYY-MM-DD HH:mm:ss');
}

function logToConsole(level, message, data = null) {
    const timestamp = getCurrentTimestamp();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    console.log(logMessage);
    if (data) {
        console.log('Data:', JSON.stringify(data, null, 2));
    }
}

async function logToFile(level, message, data = null) {
    try {
        await fs.mkdir(LOGS_DIR, { recursive: true });
        
        const timestamp = getCurrentTimestamp();
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            message,
            data: data || null
        };
        
        const logFileName = `app-${moment().format('YYYY-MM-DD')}.log`;
        const logFilePath = path.join(LOGS_DIR, logFileName);
        const logLine = JSON.stringify(logEntry) + '\n';
        
        await fs.appendFile(logFilePath, logLine);
    } catch (error) {
        console.error('Failed to write to log file:', error.message);
    }
}

function log(level, message, data = null) {
    logToConsole(level, message, data);
    logToFile(level, message, data);
}

// Request logging middleware
app.use((req, res, next) => {
    const startTime = Date.now();
    const originalJson = res.json;
    
    res.json = function(body) {
        const duration = Date.now() - startTime;
        log('info', `${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`, {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            userAgent: req.get('User-Agent') || 'Unknown',
            ip: req.ip || req.connection.remoteAddress
        });
        return originalJson.call(this, body);
    };
    
    next();
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

log('info', '🌿 Green Ledger server starting up...');

// Data directory paths
const DATA_DIR = path.join(__dirname, 'data');
const COMPANIES_FILE = path.join(DATA_DIR, 'companies.json');
const ESG_ACTIVITIES_FILE = path.join(DATA_DIR, 'esg_activities.json');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Initialize data directory and files
async function initializeDataFiles() {
    try {
        log('info', 'Initializing data directory and files...');
        await fs.mkdir(DATA_DIR, { recursive: true });
        
        const files = [
            { path: COMPANIES_FILE, default: [] },
            { path: ESG_ACTIVITIES_FILE, default: [] },
            { path: REPORTS_FILE, default: [] },
            { path: USERS_FILE, default: [] }
        ];

        for (const file of files) {
            try {
                await fs.access(file.path);
                log('info', `Data file exists: ${path.basename(file.path)}`);
            } catch {
                await fs.writeFile(file.path, JSON.stringify(file.default, null, 2));
                log('info', `Created new data file: ${path.basename(file.path)}`);
            }
        }
        
        log('info', 'Data files initialization completed successfully');
    } catch (error) {
        log('error', 'Error initializing data files', { error: error.message, stack: error.stack });
    }
}

// Utility functions
async function readJSONFile(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        const parsedData = JSON.parse(data);
        log('debug', `Successfully read JSON file: ${path.basename(filePath)}`, { recordCount: parsedData.length });
        return parsedData;
    } catch (error) {
        log('error', `Failed to read JSON file: ${path.basename(filePath)}`, { error: error.message });
        return [];
    }
}

async function writeJSONFile(filePath, data) {
    try {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        log('debug', `Successfully wrote JSON file: ${path.basename(filePath)}`, { recordCount: data.length });
    } catch (error) {
        log('error', `Failed to write JSON file: ${path.basename(filePath)}`, { error: error.message });
        throw error;
    }
}

function generateHash(data) {
    try {
        const hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
        log('debug', 'Generated blockchain hash', { hashLength: hash.length, hashPrefix: hash.substring(0, 16) });
        return hash;
    } catch (error) {
        log('error', 'Failed to generate hash', { error: error.message });
        throw error;
    }
}

function calculateESGScore(activities) {
    try {
        if (!activities.length) {
            log('debug', 'No activities provided for ESG score calculation');
            return 0;
        }
        
        const weights = { environmental: 0.4, social: 0.3, governance: 0.3 };
        let totalScore = 0;
        let categoryScores = { environmental: 0, social: 0, governance: 0 };
        
        activities.forEach(activity => {
            categoryScores[activity.category] += activity.impact_score || 5;
        });
        
        Object.keys(categoryScores).forEach(category => {
            totalScore += (categoryScores[category] / activities.filter(a => a.category === category).length || 0) * weights[category];
        });
        
        const finalScore = Math.min(Math.round(totalScore), 100);
        log('debug', 'ESG score calculated', { 
            activitiesCount: activities.length, 
            categoryScores, 
            finalScore 
        });
        
        return finalScore;
    } catch (error) {
        log('error', 'Failed to calculate ESG score', { error: error.message });
        return 0;
    }
}

// API Routes

// Get all companies
app.get('/api/companies', async (req, res) => {
    try {
        log('info', 'Fetching all companies');
        const companies = await readJSONFile(COMPANIES_FILE);
        log('info', `Successfully fetched ${companies.length} companies`);
        res.json(companies);
    } catch (error) {
        log('error', 'Failed to fetch companies', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch companies' });
    }
});

// Create new company
app.post('/api/companies', async (req, res) => {
    try {
        log('info', 'Creating new company', { companyData: req.body });
        const companies = await readJSONFile(COMPANIES_FILE);
        const newCompany = {
            id: uuidv4(),
            ...req.body,
            created_at: moment().toISOString(),
            esg_score: 0
        };
        
        companies.push(newCompany);
        await writeJSONFile(COMPANIES_FILE, companies);
        
        log('info', 'Successfully created new company', { 
            companyId: newCompany.id, 
            companyName: newCompany.name 
        });
        
        res.status(201).json(newCompany);
    } catch (error) {
        log('error', 'Failed to create company', { error: error.message, requestBody: req.body });
        res.status(500).json({ error: 'Failed to create company' });
    }
});

// Get company by ID
app.get('/api/companies/:id', async (req, res) => {
    try {
        const companyId = req.params.id;
        log('info', `Fetching company by ID: ${companyId}`);
        
        const companies = await readJSONFile(COMPANIES_FILE);
        const company = companies.find(c => c.id === companyId);
        
        if (!company) {
            log('warn', `Company not found: ${companyId}`);
            return res.status(404).json({ error: 'Company not found' });
        }
        
        // Get company's ESG activities
        const activities = await readJSONFile(ESG_ACTIVITIES_FILE);
        const companyActivities = activities.filter(a => a.company_id === companyId);
        
        // Calculate ESG score
        company.esg_score = calculateESGScore(companyActivities);
        company.total_activities = companyActivities.length;
        
        log('info', `Successfully fetched company: ${company.name}`, { 
            esgScore: company.esg_score, 
            totalActivities: company.total_activities 
        });
        
        res.json(company);
    } catch (error) {
        log('error', `Failed to fetch company: ${req.params.id}`, { error: error.message });
        res.status(500).json({ error: 'Failed to fetch company' });
    }
});

// Get ESG activities
app.get('/api/esg-activities', async (req, res) => {
    try {
        const { company_id, category } = req.query;
        log('info', 'Fetching ESG activities', { filters: { company_id, category } });
        
        const activities = await readJSONFile(ESG_ACTIVITIES_FILE);
        let filteredActivities = activities;
        
        if (company_id) {
            filteredActivities = filteredActivities.filter(a => a.company_id === company_id);
        }
        
        if (category) {
            filteredActivities = filteredActivities.filter(a => a.category === category);
        }
        
        const sortedActivities = filteredActivities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        log('info', `Successfully fetched ${sortedActivities.length} ESG activities`, {
            totalActivities: activities.length,
            filteredActivities: sortedActivities.length,
            filters: { company_id, category }
        });
        
        res.json(sortedActivities);
    } catch (error) {
        log('error', 'Failed to fetch ESG activities', { error: error.message, query: req.query });
        res.status(500).json({ error: 'Failed to fetch ESG activities' });
    }
});

// Create new ESG activity
app.post('/api/esg-activities', async (req, res) => {
    try {
        log('info', 'Creating new ESG activity', { activityData: req.body });
        
        const activities = await readJSONFile(ESG_ACTIVITIES_FILE);
        const activityData = {
            id: uuidv4(),
            ...req.body,
            created_at: moment().toISOString()
        };
        
        // Generate blockchain hash
        activityData.hash = generateHash(activityData);
        activityData.prev_hash = activities.length > 0 ? activities[activities.length - 1].hash : '0';
        
        activities.push(activityData);
        await writeJSONFile(ESG_ACTIVITIES_FILE, activities);
        
        log('info', 'Successfully created ESG activity', {
            activityId: activityData.id,
            title: activityData.title,
            category: activityData.category,
            companyId: activityData.company_id,
            hash: activityData.hash.substring(0, 16) + '...'
        });
        
        res.status(201).json(activityData);
    } catch (error) {
        log('error', 'Failed to create ESG activity', { error: error.message, requestBody: req.body });
        res.status(500).json({ error: 'Failed to create ESG activity' });
    }
});

// Generate ESG report
app.post('/api/reports/:companyId', async (req, res) => {
    try {
        const { companyId } = req.params;
        const { framework = 'GRI', period = '2024' } = req.body;
        
        log('info', 'Generating ESG report', { companyId, framework, period });
        
        const companies = await readJSONFile(COMPANIES_FILE);
        const company = companies.find(c => c.id === companyId);
        
        if (!company) {
            log('warn', `Company not found for report generation: ${companyId}`);
            return res.status(404).json({ error: 'Company not found' });
        }
        
        const activities = await readJSONFile(ESG_ACTIVITIES_FILE);
        const companyActivities = activities.filter(a => a.company_id === companyId);
        
        const report = {
            id: uuidv4(),
            company_id: companyId,
            company_name: company.name,
            framework,
            period,
            generated_at: moment().toISOString(),
            esg_score: calculateESGScore(companyActivities),
            total_activities: companyActivities.length,
            activities_by_category: {
                environmental: companyActivities.filter(a => a.category === 'environmental').length,
                social: companyActivities.filter(a => a.category === 'social').length,
                governance: companyActivities.filter(a => a.category === 'governance').length
            },
            hash: generateHash({ companyId, framework, period, activities: companyActivities })
        };
        
        const reports = await readJSONFile(REPORTS_FILE);
        reports.push(report);
        await writeJSONFile(REPORTS_FILE, reports);
        
        log('info', 'Successfully generated ESG report', {
            reportId: report.id,
            companyName: report.company_name,
            framework: report.framework,
            esgScore: report.esg_score,
            totalActivities: report.total_activities,
            reportHash: report.hash.substring(0, 16) + '...'
        });
        
        res.json(report);
    } catch (error) {
        log('error', `Failed to generate ESG report for company: ${req.params.companyId}`, { 
            error: error.message, 
            requestBody: req.body 
        });
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

// Get dashboard data
app.get('/api/dashboard/:companyId', async (req, res) => {
    try {
        const { companyId } = req.params;
        log('info', `Fetching dashboard data for company: ${companyId}`);
        
        const companies = await readJSONFile(COMPANIES_FILE);
        const company = companies.find(c => c.id === companyId);
        
        if (!company) {
            log('warn', `Company not found for dashboard: ${companyId}`);
            return res.status(404).json({ error: 'Company not found' });
        }
        
        const activities = await readJSONFile(ESG_ACTIVITIES_FILE);
        const companyActivities = activities.filter(a => a.company_id === companyId);
        
        const dashboard = {
            company: company.name,
            esg_score: calculateESGScore(companyActivities),
            total_activities: companyActivities.length,
            categories: {
                environmental: companyActivities.filter(a => a.category === 'environmental').length,
                social: companyActivities.filter(a => a.category === 'social').length,
                governance: companyActivities.filter(a => a.category === 'governance').length
            },
            recent_activities: companyActivities.slice(0, 5),
            monthly_trend: getMonthlyTrend(companyActivities)
        };
        
        log('info', `Successfully generated dashboard data for: ${company.name}`, {
            esgScore: dashboard.esg_score,
            totalActivities: dashboard.total_activities,
            categoryBreakdown: dashboard.categories
        });
        
        res.json(dashboard);
    } catch (error) {
        log('error', `Failed to fetch dashboard data for company: ${req.params.companyId}`, { 
            error: error.message 
        });
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

function getMonthlyTrend(activities) {
    try {
        const trend = {};
        activities.forEach(activity => {
            const month = moment(activity.created_at).format('YYYY-MM');
            trend[month] = (trend[month] || 0) + 1;
        });
        
        log('debug', 'Generated monthly trend data', { 
            monthsWithData: Object.keys(trend).length,
            totalActivities: activities.length 
        });
        
        return trend;
    } catch (error) {
        log('error', 'Failed to generate monthly trend data', { error: error.message });
        return {};
    }
}

// Serve main page
app.get('/', (req, res) => {
    log('info', 'Serving main page');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    log('error', 'Unhandled error occurred', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method
    });
    
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// 404 handler
app.use((req, res) => {
    log('warn', `404 - Route not found: ${req.method} ${req.path}`, {
        userAgent: req.get('User-Agent'),
        ip: req.ip
    });
    
    res.status(404).json({ 
        error: 'Route not found',
        path: req.path,
        method: req.method
    });
});

// Initialize and start server
async function startServer() {
    try {
        await initializeDataFiles();
        
        const server = app.listen(PORT, () => {
            log('info', `🌿 Green Ledger server successfully started`, {
                port: PORT,
                environment: process.env.NODE_ENV || 'development',
                nodeVersion: process.version,
                timestamp: getCurrentTimestamp()
            });
            console.log(`🌿 Green Ledger server running on http://localhost:${PORT}`);
            console.log('📊 ESG Compliance & Reporting Tool for Pakistani Corporates');
            console.log(`📝 Logs are being written to: ${LOGS_DIR}`);
        });
        
        // Graceful shutdown
        process.on('SIGINT', () => {
            log('info', 'Received SIGINT, shutting down gracefully...');
            server.close(() => {
                log('info', 'Server closed successfully');
                process.exit(0);
            });
        });
        
        process.on('SIGTERM', () => {
            log('info', 'Received SIGTERM, shutting down gracefully...');
            server.close(() => {
                log('info', 'Server closed successfully');
                process.exit(0);
            });
        });
        
    } catch (error) {
        log('error', 'Failed to start server', { 
            error: error.message, 
            stack: error.stack 
        });
        process.exit(1);
    }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    log('error', 'Uncaught Exception', {
        error: error.message,
        stack: error.stack
    });
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    log('error', 'Unhandled Rejection', {
        reason: reason,
        promise: promise
    });
});

startServer();