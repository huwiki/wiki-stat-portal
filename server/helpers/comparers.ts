export const compareNumbers = (a: number, b: number): number =>
	a < b ? -1 : a > b ? 1 : 0;

export const compareMoments = (a: moment.Moment, b: moment.Moment): number => {
	if (a.isValid() === false && b.isValid() === false)
		return 0;
	if (a.isValid() === false)
		return 1;
	if (b.isValid() === false)
		return -1;

	const aVal = a.valueOf();
	const bVal = b.valueOf();
	return compareNumbers(aVal, bVal);
};
