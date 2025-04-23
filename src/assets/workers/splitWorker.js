import * as XLSX from "xlsx";

self.onmessage = async (e) => {
  const { action, files } = e.data;
  if (action === "process") {
    try {
      postMessage({ type: "log", message: `📥 Cargando ${files.length} archivo(s)...` });

      const allRows = new Map();
      let headers = [];

      // Leer y deduplicar
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const data = await readExcel(file);

        if (data.length > 0 && headers.length === 0) {
          headers = Object.keys(data[0]);
        }

        data.forEach((row) => {
          const id = row["_ProductId (Not changeable)"];
          if (id) allRows.set(id, row);
        });

        postMessage({ type: "log", message: `✔️ ${file.name} leído con ${data.length} filas.` });
        postMessage({ type: "progress", progress: Math.round(((i + 1) / files.length) * 50) });
      }

      const deduplicated = Array.from(allRows.values());
      postMessage({ type: "log", message: `🔍 Deduplicación completa: ${deduplicated.length} ítems únicos.` });

      // Dividir en chunks de 10,000
      const chunks = chunkArray(deduplicated, 10000);
      postMessage({ type: "log", message: `📦 Generando ${chunks.length} archivo(s) de salida...` });

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const ws = XLSX.utils.json_to_sheet(chunk, { header: headers });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Hoja1");

        const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });

        const blob = new Blob([wbout], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);

        postMessage({
          type: "log",
          message: `📁 Archivo generado: bloque_${i + 1}.xlsx (${chunk.length} ítems).`,
        });

        // ⚠️ Solo referencia (no descarga directa desde el worker)
        postMessage({
          type: "download",
          fileName: `bloque_${i + 1}.xlsx`,
          fileUrl: url,
        });

        postMessage({ type: "progress", progress: 50 + Math.round(((i + 1) / chunks.length) * 50) });
      }

      postMessage({ type: "complete", message: "✅ Proceso finalizado correctamente." });
    } catch (err) {
      postMessage({ type: "error", message: err.message });
    }
  }
};

// Lee un archivo Excel desde un File objeto
function readExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet);
        resolve(json);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// Divide un array en trozos
function chunkArray(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}
