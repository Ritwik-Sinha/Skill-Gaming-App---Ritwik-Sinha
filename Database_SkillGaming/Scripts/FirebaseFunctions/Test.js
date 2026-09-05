const functions = require('firebase-functions/v1');
const { query } = require('../db');

exports.getUsers = functions.region('asia-south1').https.onRequest(async (req, res) => {
	if (req.method !== 'GET') {
		res.set('Allow', 'GET');
		return res.status(405).json({ error: 'Only GET requests are supported.' });
	}

	try {
		const result = await query('SELECT * FROM users');
		return res.status(200).json({ users: result.rows });
	} catch (error) {
		console.error('Failed to load users:', error.message);
		return res.status(500).json({ error: 'Unable to load users.' });
	}
});
