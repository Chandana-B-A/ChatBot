const auth = require('basic-auth');

function basicAuth(req, res, next) {
    const credentials = auth(req);
    
    if (!credentials || 
        credentials.name !== process.env.AUTH_USERNAME || 
        credentials.pass !== process.env.AUTH_PASSWORD) {
        res.set('WWW-Authenticate', 'Basic realm="API Access"');
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    next();
}

module.exports = basicAuth;