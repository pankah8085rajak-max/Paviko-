const express = require('express');
const app = express();
const PORT = process.env.PORT || 5000;

app.get('/health', (req, res) => {
    res.json({ status: 'OK' });
});

app.get('/api/workers', (req, res) => {
    res.json({ workers: [] });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
