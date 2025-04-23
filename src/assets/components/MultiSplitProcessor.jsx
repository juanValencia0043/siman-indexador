import React, { useState, useRef, useEffect } from "react";

const MultiSplitProcessor = () => {
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const workerRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const worker = new Worker(
      new URL("../workers/splitWorker.js", import.meta.url),
      {
        type: "module",
      }
    );

    worker.onmessage = (e) => {
      const { type, message, progress } = e.data;
      switch (type) {
        case "log":
          setLogs((prev) => [...prev, message]);
          break;
        case "progress":
          setProgress(progress);
          break;
        case "complete":
          setIsProcessing(false);
          setLogs((prev) => [...prev, message]);
          break;
        case "error":
          setIsProcessing(false);
          setLogs((prev) => [...prev, `❌ Error: ${message}`]);
          break;
        case "download": {
          const link = document.createElement("a");
          link.href = e.data.fileUrl;
          link.download = e.data.fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(e.data.fileUrl);
          break;
        }
        default:
          break;
      }
    };

    workerRef.current = worker;

    return () => {
      worker.terminate();
    };
  }, []);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setLogs([]);
    setProgress(0);
    setIsProcessing(true);

    workerRef.current.postMessage({ action: "process", files });
  };

  return (
    <div className="container">
      <h1>SIMAN | Dividir Archivos por Lotes de 10,000 Productos</h1>

      <div className="upload-area">
        <input
          type="file"
          accept=".xls,.xlsx"
          multiple
          ref={fileInputRef}
          onChange={handleFileChange}
          disabled={isProcessing}
        />
        <p>Selecciona uno o varios archivos Excel para dividirlos en bloques.</p>

        {isProcessing && (
          <>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p style={{ color: "#007bff", fontWeight: "bold", marginTop: "0.5rem" }}>
              Procesando archivos...
            </p>
          </>
        )}
      </div>

      <div className="log-container">
        <h3>Registro de actividad</h3>
        <div className="log-content">
          {logs.length === 0 ? (
            <p className="empty-logs">No hay actividad para mostrar</p>
          ) : (
            logs.map((log, idx) => <p key={idx}>{log}</p>)
          )}
        </div>
      </div>
    </div>
  );
};

export default MultiSplitProcessor;
