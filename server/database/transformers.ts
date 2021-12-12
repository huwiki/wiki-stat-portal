import moment from "moment";

const TIMESTAMP_FORMAT = "YYYYMMDDHHmmss";

export const bufferToStringTransformer = {
	from: (source: Buffer | null): string | null => source?.toString() ?? null,
	to: (source: string | null): Buffer | null => source != null ? Buffer.from(source) : null
};

export const bufferToDateTransformer = {
	from: (source: Buffer | null): Date | null => {
		const rawValue = source?.toString() ?? null;
		if (rawValue == null)
			return null;

		try {
			return moment.utc(rawValue, TIMESTAMP_FORMAT).toDate();
		} catch (err) {
			return null;
		}
	},
	to: (source: Date | null): Buffer | null => {
		if (source == null) {
			return null;
		}

		return Buffer.from(moment.utc(source).format(TIMESTAMP_FORMAT));
	}
};

export const intToBooleanTransformer = {
	from: (source: number | null): boolean | null => source != null
		? !!source
		: null,
	to: (source: boolean | null): number | null => source != null
		? (source ? 1 : 0)
		: null
};

export const dateToMomentTransformer = {
	from: (source: Date | null): moment.Moment | null => {
		console.log(source, "cica");
		// const rawValue = source?.toString() ?? null;
		// if (rawValue == null)
		// 	return null;

		// try {
		// 	const date = moment.utc(rawValue, TIMESTAMP_FORMAT);
		// 	return date.toDate();
		// } catch (err) {
		// 	return null;
		// }
		return null;
	},
	to: (source: moment.Moment | null): Date | null => {
		console.log(source, "momentSource");
		const ret = source?.toDate() ?? null;
		console.log(ret);
		return ret;
	}
};
