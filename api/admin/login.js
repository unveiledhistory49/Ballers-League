module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { key } = req.body;
    const ADMIN_KEY = process.env.ADMIN_KEY;

    if (!ADMIN_KEY) {
      return res.status(500).json({ success: false, message: 'Admin key not configured' });
    }

    if (key === ADMIN_KEY) {
      res.status(200).json({ success: true, message: 'Authenticated' });
    } else {
      res.status(401).json({ success: false, message: 'Invalid key' });
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
