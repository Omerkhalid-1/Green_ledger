const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Data directory paths
const DATA_DIR = path.join(__dirname, 'data');
const COMPANIES_FILE = path.join(DATA_DIR, 'companies.json');
const ESG_ACTIVITIES_FILE = path.join(DATA_DIR, 'esg_activities.json');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Initialize data directory and files
async function initializeDataFiles() {
    try {
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
            } catch {
                await fs.writeFile(file.path, JSON.stringify(file.default, null, 2));
            }
        }
    } catch (error) {
        console.error('Error initializing data files:', error);
    }
}

// Utility functions
async function readJSONFile(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

async function writeJSONFile(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

function generateHash(data) {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function calculateESGScore(activities) {
    if (!activities.length) return 0;
    
    const weights = { environmental: 0.4, social: 0.3, governance: 0.3 };
    let totalScore = 0;
    let categoryScores = { environmental: 0, social: 0, governance: 0 };
    
    activities.forEach(activity => {
        categoryScores[activity.category] += activity.impact_score || 5;
    });
    
    Object.keys(categoryScores).forEach(category => {
        totalScore += (categoryScores[category] / activities.filter(a => a.category === category).length || 0) * weights[category];
    });
    
    return Math.min(Math.round(totalScore), 100);
}

// API Routes

// Get all companies
app.get('/api/companies', async (req, res) => {
    try {
        const companies = await readJSONFile(COMPANIES_FILE);
        res.json(companies);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch companies' });
    }
});

// Create new company
app.post('/api/companies', async (req, res) => {
    try {
        const companies = await readJSONFile(COMPANIES_FILE);
        const newCompany = {
            id: uuidv4(),
            ...req.body,
            created_at: moment().toISOString(),
            esg_score: 0
        };
        
        companies.push(newCompany);
        await writeJSONFile(COMPANIES_FILE, companies);
        res.status(201).json(newCompany);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create company' });
    }
});

// Get company by ID
app.get('/api/companies/:id', async (req, res) => {
    try {
        const companies = await readJSONFile(COMPANIES_FILE);
        const company = companies.find(c => c.id === req.params.id);
        
        if (!company) {
            return res.status(404).json({ error: 'Company not found' });
        }
        
        // Get company's ESG activities
        const activities = await readJSONFile(ESG_ACTIVITIES_FILE);
        const companyActivities = activities.filter(a => a.company_id === req.params.id);
        
        // Calculate ESG score
        company.esg_score = calculateESGScore(companyActivities);
        company.total_activities = companyActivities.length;
        
        res.json(company);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch company' });
    }
});

// Get ESG activities
app.get('/api/esg-activities', async (req, res) => {
    try {
        const activities = await readJSONFile(ESG_ACTIVITIES_FILE);
        const { company_id, category } = req.query;
        
        let filteredActivities = activities;
        
        if (company_id) {
            filteredActivities = filteredActivities.filter(a => a.company_id === company_id);
        }
        
        if (category) {
            filteredActivities = filteredActivities.filter(a => a.category === category);
        }
        
        res.json(filteredActivities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch ESG activities' });
    }
});

// Create new ESG activity
app.post('/api/esg-activities', async (req, res) => {
    try {
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
        
        res.status(201).json(activityData);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create ESG activity' });
    }
});

// Generate ESG report
app.post('/api/reports/:companyId', async (req, res) => {
    try {
        const { companyId } = req.params;
        const { framework = 'GRI', period = '2024' } = req.body;
        
        const companies = await readJSONFile(COMPANIES_FILE);
        const company = companies.find(c => c.id === companyId);
        
        if (!company) {
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
        
        res.json(report);
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

// Get dashboard data
app.get('/api/dashboard/:companyId', async (req, res) => {
    try {
        const { companyId } = req.params;
        
        const companies = await readJSONFile(COMPANIES_FILE);
        const company = companies.find(c => c.id === companyId);
        
        if (!company) {
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
        
        res.json(dashboard);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

function getMonthlyTrend(activities) {
    const trend = {};
    activities.forEach(activity => {
        const month = moment(activity.created_at).format('YYYY-MM');
        trend[month] = (trend[month] || 0) + 1;
    });
    return trend;
}

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize and start server
async function startServer() {
    await initializeDataFiles();
    app.listen(PORT, () => {
        console.log(`🌿 Green Ledger server running on http://localhost:${PORT}`);
        console.log('📊 ESG Compliance & Reporting Tool for Pakistani Corporates');
    });
}

startServer();