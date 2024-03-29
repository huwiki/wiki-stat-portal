import fs from "fs";

export const fileExists = (path: string): boolean => {
	return fs.existsSync(path);
};

export function* getSubdirectories(path = "./"): Generator<string> {
	const entries = fs.readdirSync(path, { withFileTypes: true });

	for (const entry of entries) {
		if (entry.isDirectory()) {
			yield `${path}/${entry.name}`;
		}
	}
}

export function getFilesSync(path = "./", recursive: boolean = false): string[] {
	const ret: string[] = [];
	const entries = fs.readdirSync(path, { withFileTypes: true });

	for (const entry of entries) {
		if (entry.isDirectory() && recursive === true) {
			ret.push(...getFilesSync(`${path}/${entry.name}`, recursive));
		} else {
			ret.push(`${path}/${entry.name}`);
		}
	}

	return ret;
}

export function* getFilesAsync(path = "./", recursive: boolean = false): Generator<string> {
	const entries = fs.readdirSync(path, { withFileTypes: true });

	for (const entry of entries) {
		if (entry.isDirectory() && recursive === true) {
			yield* getFilesAsync(`${path}/${entry.name}`, recursive);
		} else {
			yield `${path}/${entry.name}`;
		}
	}
}

export function readFileLines(filePath: string): string[] {
	const fileContent = fs.readFileSync(filePath, { encoding: "utf-8" });
	return fileContent.split(/\r?\n/);
}
