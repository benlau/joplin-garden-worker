function deduplicate(arr, predicate) {
    const map = new Map(arr.map((item) => [predicate(item), item]));
    return Array.from(map, ([_key, value]) => value);
}

module.exports = {
    deduplicate,
};
