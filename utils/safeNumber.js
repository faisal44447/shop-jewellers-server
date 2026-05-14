const safeNumber = (v) => {
    const n = Number(v);
    return isNaN(n) ? 0 : n;
};

module.exports = safeNumber;