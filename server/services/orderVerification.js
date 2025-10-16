function normalizeNumber(n) {
    if (n === undefined || n === null) return undefined;
    const parsed = parseInt(String(n).trim(), 10);
    return Number.isNaN(parsed) ? undefined : parsed;
}

function verifyOrderId(orderId, orders) {
    console.log('Verifying order ID:', orderId);
    const id = normalizeNumber(orderId);
    if (!id) return { ok: false, code: 'ORDER_ID_REQUIRED' };
    const order = orders.find(o => o.orderId === id);
    if (!order) return { ok: false, code: 'ORDER_NOT_FOUND' };
    return { ok: true, code: 'ORDER_ID_VALID', order };
}

function verifyPhoneNumber(orderId, phoneNumber, orders) {
    const idCheck = verifyOrderId(orderId, orders);
    if (!idCheck.ok) return { ok: false, code: idCheck.code };
    const phone = normalizeNumber(phoneNumber);
    if (phone === undefined) return { ok: false, code: 'PHONE_REQUIRED' };
    const storedPhone = normalizeNumber(idCheck.order.phNum);
    if (phone !== storedPhone) return { ok: false, code: 'PHONE_MISMATCH' };
    return { ok: true, code: 'PHONE_MATCH', order: idCheck.order };
}

function fetchTrackingStatus(orderId, phoneNumber, orders) {
    const phoneCheck = verifyPhoneNumber(orderId, phoneNumber, orders);
    if (!phoneCheck.ok) return { ok: false, code: phoneCheck.code };
    const o = phoneCheck.order;
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
    verifyOrderId,
    verifyPhoneNumber,
    fetchTrackingStatus
};