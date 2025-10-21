const { storage, dbConfig, getBucket, getFile } = require('../../config/database');

function normalizeNumber(n) {
    if (n === undefined || n === null) return undefined;
    const parsed = parseInt(String(n).trim(), 10);
    return Number.isNaN(parsed) ? undefined : parsed;
}

// Cloud Storage config and simple in-memory cache
// Use centralized database configuration
const { bucketName, fileName } = dbConfig;
let ordersData = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function invalidateOrdersCache() {
    ordersData = null;
    lastFetchTime = 0;
}

async function fetchOrderData() {
    const now = Date.now();
    if (ordersData && (now - lastFetchTime) < CACHE_DURATION) {
        return ordersData;
    }
    console.log('Refreshing orders from GCS bucket:', bucketName, 'file:', fileName);
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(fileName);
    const [data] = await file.download();
    ordersData = JSON.parse(data.toString());
    lastFetchTime = now;
    return ordersData;
}

function verifyOrderId(orderId, orders) {
    console.log('Verifying order ID:', orderId);
    const id = normalizeNumber(orderId);
    if (!id) return { ok: false, code: 'ORDER_ID_REQUIRED' };
    const order = orders.find(o => o.orderId === id);
    if (!order) return { ok: false, code: 'ORDER_NOT_FOUND' };
    return { ok: true, code: 'ORDER_ID_VALID', order };
}

function normalizeDobVariants(s) {
    if (s === undefined || s === null) return [];
    if (typeof s === 'object' && !Array.isArray(s)) {
        const y = parseInt(String(s.year ?? s.y ?? '').trim(), 10);
        const m = parseInt(String(s.month ?? s.m ?? '').trim(), 10);
        const d = parseInt(String(s.day ?? s.d ?? '').trim(), 10);
        if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return [];
        if (m < 1 || m > 12 || d < 1 || d > 31) return [];
        const canon = `${y.toString().padStart(4, '0')}${m.toString().padStart(2, '0')}${d.toString().padStart(2, '0')}`;
        return [canon];
    }
    const raw = String(s).trim();
    if (!raw) return [];
    const digits = raw.replace(/[^0-9]/g, '');
    if (digits.length !== 8) return [];
    const out = [];
    const yFirst = parseInt(digits.slice(0, 4), 10);
    if (yFirst >= 1900 && yFirst <= 2100) {
        const y = yFirst;
        const m = parseInt(digits.slice(4, 6), 10);
        const d = parseInt(digits.slice(6, 8), 10);
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
            out.push(`${y.toString().padStart(4, '0')}${m.toString().padStart(2, '0')}${d.toString().padStart(2, '0')}`);
        }
    } else {
        const y = parseInt(digits.slice(4, 8), 10);
        // DDMMYYYY
        const d = parseInt(digits.slice(0, 2), 10);
        const m = parseInt(digits.slice(2, 4), 10);
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
            out.push(`${y.toString().padStart(4, '0')}${m.toString().padStart(2, '0')}${d.toString().padStart(2, '0')}`);
        }
        // MMDDYYYY
        const m2 = parseInt(digits.slice(0, 2), 10);
        const d2 = parseInt(digits.slice(2, 4), 10);
        if (m2 >= 1 && m2 <= 12 && d2 >= 1 && d2 <= 31) {
            out.push(`${y.toString().padStart(4, '0')}${m2.toString().padStart(2, '0')}${d2.toString().padStart(2, '0')}`);
        }
    }
    return Array.from(new Set(out));
}

function verifyDOB(orderId, dob, orders) {
    const idCheck = verifyOrderId(orderId, orders);
    if (!idCheck.ok) return { ok: false, code: idCheck.code };
    console.log('Verifying DOB for order:', orderId);
    console.log('Input DOB:', dob);
    const inputCandidates = normalizeDobVariants(dob);
    if (!inputCandidates.length) return { ok: false, code: 'DOB_REQUIRED' };
    const storedCandidates = normalizeDobVariants(idCheck.order.dob);
    console.log('Normalized candidates (input):', inputCandidates);
    console.log('Normalized candidates (stored):', storedCandidates);
    if (!storedCandidates.length) return { ok: false, code: 'DOB_NOT_AVAILABLE' };
    const matched = inputCandidates.some(c => storedCandidates.includes(c));
    if (!matched) return { ok: false, code: 'DOB_MISMATCH' };
    return { ok: true, code: 'DOB_MATCH', order: idCheck.order };
}

function fetchTrackingStatusByDOB(orderId, dob, orders) {
    const dobCheck = verifyDOB(orderId, dob, orders);
    if (!dobCheck.ok) return { ok: false, code: dobCheck.code };
    const o = dobCheck.order;
    const data = {
        orderId: o.orderId,
        bookName: o.bookName,
        userName: o.userName,
        pinCode: o.pinCode,
        status: o.status,
        cancelled: !!o.cancelled,
        phoneNumber: o.phNum
    };
    return { ok: true, code: 'STATUS_OK', data };
}

module.exports = {
    // data access
    fetchOrderData,
    invalidateOrdersCache,
    // existing services
    verifyOrderId,
    verifyDOB,
    fetchTrackingStatusByDOB
};