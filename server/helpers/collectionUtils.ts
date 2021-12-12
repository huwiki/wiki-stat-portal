export const arrayHasAny = <T>(array: T[], ...items: T[]): boolean => {
	if (!items || items.length === 0)
		return false;

	return items.some((item) => {
		return array.indexOf(item) !== -1;
	});
};
