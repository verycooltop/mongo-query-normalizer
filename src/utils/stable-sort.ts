export function stableSort<T>(items: readonly T[], compareFn: (a: T, b: T) => number): T[] {
    return items
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
            const cmp = compareFn(a.item, b.item);
            if (cmp !== 0) {
                return cmp;
            }
            return a.index - b.index;
        })
        .map((entry) => entry.item);
}
