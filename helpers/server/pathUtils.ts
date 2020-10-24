import { promises as fsPromises } from "fs";

export async function* getSubdirectories(path = "./"): AsyncGenerator<string> {
	const entries = await fsPromises.readdir(path, { withFileTypes: true });

	for (const entry of entries) {
		if (entry.isDirectory()) {
			yield `${path}/${entry.name}`;
		}
	}
}

export async function* getFiles(path = "./"): AsyncGenerator<string> {
	const entries = await fsPromises.readdir(path, { withFileTypes: true });

	for (const entry of entries) {
		if (entry.isDirectory()) {
			yield* getFiles(`${path}/${entry.name}`);
		} else {
			//yield { ...entry, path: path + entry.name }
			yield `${path}/${entry.name}`;
		}
	}
}
