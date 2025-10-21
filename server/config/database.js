const { Storage } = require('@google-cloud/storage');
require('dotenv').config();

// Google Cloud Storage Configuration
const storage = new Storage({
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    credentials: {
        type: 'service_account',
        project_id: process.env.GOOGLE_CLOUD_PROJECT_ID,
        private_key_id: process.env.GOOGLE_CLOUD_PRIVATE_KEY_ID,
        private_key: process.env.GOOGLE_CLOUD_PRIVATE_KEY?.replace(/\\n/g, '\n').replace(/"/g, ''),
        client_email: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
        client_id: process.env.GOOGLE_CLOUD_CLIENT_ID,
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url: process.env.GOOGLE_CLOUD_CLIENT_X509_CERT_URL
    }
});

// Database configuration object
const dbConfig = {
    storage,
    bucketName: process.env.GOOGLE_CLOUD_BUCKET_NAME,
    fileName: 'order.json'
};

// Helper function to get bucket instance
const getBucket = () => {
    return storage.bucket(dbConfig.bucketName);
};

// Helper function to get file instance
const getFile = (fileName = dbConfig.fileName) => {
    return getBucket().file(fileName);
};

module.exports = {
    storage,
    dbConfig,
    getBucket,
    getFile
};