import fs from "fs/promises";

export async function* getFiles(path = "./"): IterableIterator<string> {
	const entries = await fs.readdir(path, { withFileTypes: true });

	for (const entry of entries) {
		if (entry.isDirectory()) {
			yield* getFiles(`${path}${entry.name}/`);
		} else {
			//yield { ...entry, path: path + entry.name }
			yield path + entry.name;
		}
	}
}
