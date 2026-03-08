// @ts-ignore
importScripts("https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js");

let pyodideReadyPromise: Promise<any>;

async function loadPyodideAndPackages() {
    // @ts-ignore
    const pyodide = await loadPyodide();
    return pyodide;
}

pyodideReadyPromise = loadPyodideAndPackages();

self.onmessage = async (event) => {
    const { id, pythonCode } = event.data;

    try {
        const pyodide = await pyodideReadyPromise;

        // Redirect stdout and stderr so we can stream them back to the main thread
        pyodide.setStdout({
            batched: (str: string) => {
                self.postMessage({ id, type: 'stdout', output: str });
            }
        });

        pyodide.setStderr({
            batched: (str: string) => {
                self.postMessage({ id, type: 'stderr', output: str });
            }
        });

        // Run the python code
        await pyodide.runPythonAsync(pythonCode);

        // Notify completion
        self.postMessage({ id, type: 'done' });
    } catch (error: any) {
        self.postMessage({ id, type: 'error', output: error.toString() });
    }
};
