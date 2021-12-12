export const arrayHasAny = <T>(array: T[], ...items: T[]): boolean => {
	if (!items || items.length === 0)
		return false;

	return items.some((item) => {
		return array.indexOf(item) !== -1;
	});
};

export const sequenceEqual = <T>(firstArr: T[], secondArr: unknown): boolean => {
	if (!firstArr
		|| !secondArr
		|| !Array.isArray(firstArr)
		|| !Array.isArray(secondArr))
		return false;

	return typeof (secondArr) === "object"
		&& firstArr.length === secondArr.length
		&& firstArr.every((ele, i) => ele === secondArr[i]);
};
