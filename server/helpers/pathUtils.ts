import { promises as fsPromises } from "fs";

export const fileExistsAsync = async (path: string): Promise<boolean> => !!(await fsPromises.stat(path).catch(_ => false));

export async function* getSubdirectoriesAsync(path = "./"): AsyncGenerator<string> {
	const entries = await fsPromises.readdir(path, { withFileTypes: true });

	for (const entry of entries) {
		if (entry.isDirectory()) {
			yield `${path}/${entry.name}`;
		}
	}
}

export async function* getFilesAsync(path = "./", recursive: boolean = false): AsyncGenerator<string> {
	const entries = await fsPromises.readdir(path, { withFileTypes: true });

	for (const entry of entries) {
		if (entry.isDirectory() && recursive === true) {
			yield* getFilesAsync(`${path}/${entry.name}`, recursive);
		} else {
			//yield { ...entry, path: path + entry.name }
			yield `${path}/${entry.name}`;
		}
	}
}
