const sendSuccess = (res, data, message) => {
  res.json({ ok: true, ...data, ...(message && { message }) });
};

const sendError = (res, status, error, errorEn) => {
  res.status(status).json({ error, ...(errorEn && { errorEn }) });
};

const sendNotFound = (res, itemAr = 'العنصر', itemEn = 'Item') => {
  res.status(404).json({ error: `${itemAr} غير موجود`, errorEn: `${itemEn} not found` });
};

const sendBadRequest = (res, error, errorEn) => {
  res.status(400).json({ error, errorEn });
};

const sendUnauthorized = (res) => {
  res.status(401).json({ error: 'غير مصرح', errorEn: 'Unauthorized' });
};

const sendForbidden = (res) => {
  res.status(403).json({ error: 'ممنوع الوصول', errorEn: 'Forbidden' });
};

module.exports = {
  sendSuccess,
  sendError,
  sendNotFound,
  sendBadRequest,
  sendUnauthorized,
  sendForbidden
};
