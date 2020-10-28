import { format, parse } from "date-fns";

export const bufferToStringTransformer = {
	from: (source: Buffer | null): string | null => source?.toString() ?? null,
	to: (source: string | null): Buffer | null => source != null ? Buffer.from(source) : null
};

export const bufferToDateTimeTransformer = {
	from: (source: Buffer | null): Date | null => {
		const rawValue = source?.toString() ?? null;
		if (rawValue == null)
			return null;

		try {
			const date = parse(rawValue, "yyyyMMddHHmmss", new Date());
			return date;
		} catch (err) {
			return null;
		}
	},
	to: (source: Date | null): Buffer | null => {
		if (source == null) {
			return null;
		}

		return Buffer.from(format(source, "yyyyMMddHHmmss"));
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
