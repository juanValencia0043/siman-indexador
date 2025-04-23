import React, { useState, useRef, useEffect } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import MultiSplitProcessor from "./assets/components/MultiSplitProcessor.jsx";

const FileProcessor = () => {
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Esperando archivos...");
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState([]);
  const [uniqueIdsCount, setUniqueIdsCount] = useState(0);
  const [currentFile, setCurrentFile] = useState("");
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const reportRef = useRef(null);
  const [activeView, setActiveView] = useState("main");

  const fileInputRef = useRef(null);
  const workerRef = useRef(null); // 💡 Usamos useRef para el Worker

  // Inicializar Worker
  useEffect(() => {
    const handleProgress = (data) => {
      if (data.progress !== undefined) setProgress(data.progress);
      if (data.currentFile) setCurrentFile(data.currentFile);
      if (data.processedCount !== undefined)
        setProcessedCount(data.processedCount);
      if (data.totalCount !== undefined) setTotalCount(data.totalCount);
    };

    const handleDeduplicateComplete = (data) => {
      setUniqueIdsCount(data.uniqueIdsCount);
      setLogs((prev) => [
        ...prev,
        `Se encontraron ${formatNumber(
          data.uniqueIdsCount
        )} IDs únicos después de la deduplicación.`,
      ]);
      startProcessingRequests(data.uniqueIds);
    };

    const handleProcessComplete = (data) => {
      setIsProcessing(false);
      setStatus("Proceso completado");
      setCurrentFile(""); // limpiar nombre de archivo en progreso
      setLogs((prev) => [
        ...prev,
        `Procesamiento completado.`,
        `Solicitudes exitosas: ${data.successCount}`,
        ...(data.failedRequests.length > 0
          ? [
              `Errores (${data.failedRequests.length}):`,
              ...data.failedRequests.slice(0, 10),
            ]
          : ["Todos los requests fueron exitosos"]),
      ]);
    };

    const handleError = (data) => {
      setLogs((prev) => [...prev, `ERROR: ${data.message}`]);
    };

    const workerInstance = new Worker(
      new URL("./assets/workers/fileProcessor.worker.js", import.meta.url),
      { type: "module" }   
    );

    workerInstance.onmessage = (e) => {
      const { type } = e.data;
      const data = e.data;

      switch (type) {
        case "progress":
          handleProgress(data);
          break;
        case "deduplicateComplete":
          handleDeduplicateComplete(data);
          break;
        case "processComplete":
          handleProcessComplete(data);
          break;
        case "error":
          handleError(data);
          break;
        case "log":
          setLogs((prev) => [...prev, data.message]);
          break;
        default:
          break;
      }
    };

    workerRef.current = workerInstance;

    return () => {
      workerInstance.terminate();
    };
  }, []);

  const handleFileChange = (e) => {
    setFiles([...e.target.files]);
    setStatus(`${e.target.files.length} archivo(s) seleccionado(s)`);
    setLogs((prev) => [
      ...prev,
      `Archivos seleccionados: ${e.target.files.length}`,
    ]);
  };

  const startProcessingRequests = (uniqueIds) => {
    setStatus("Enviando solicitudes...");
    setProgress(0);
    setTotalCount(uniqueIds.length);
    setProcessedCount(0);

    if (workerRef.current) {
      workerRef.current.postMessage({
        action: "processRequests",
        uniqueIds,
        endpointUrl:
          "https://omnicanal.simanscs.com/omnicanal/ecommerce/v1/webhook/items",
      });
    } else {
      setLogs((prev) => [...prev, "ERROR: Worker no está disponible"]);
    }
  };

  const processFiles = () => {
    if (files.length === 0) {
      setStatus("Por favor selecciona al menos un archivo");
      return;
    }

    setIsProcessing(true);
    setStatus("Procesando archivos...");
    setLogs((prev) => [...prev, "Iniciando deduplicación..."]);
    setProgress(0);

    if (workerRef.current) {
      workerRef.current.postMessage({
        action: "deduplicate",
        files: files,
      });
    } else {
      setLogs((prev) => [...prev, "ERROR: Worker no está disponible"]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  const formatNumber = (num) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  const resetForm = () => {
    setFiles([]);
    setProgress(0);
    setStatus("Esperando archivos...");
    setIsProcessing(false);
    setLogs([]);
    setUniqueIdsCount(0);
    setCurrentFile("");
    setProcessedCount(0);
    setTotalCount(0);
    fileInputRef.current.value = null;
  };

  const generatePDFReport = async () => {
    const input = reportRef.current;

    if (!input) return;

    const canvas = await html2canvas(input, {
      scale: 2,
      useCORS: true,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");

    const pageWidth = pdf.internal.pageSize.getWidth();
    const imgProps = pdf.getImageProperties(imgData);
    const imgHeight = (imgProps.height * pageWidth) / imgProps.width;

    pdf.addImage(imgData, "PNG", 0, 0, pageWidth, imgHeight);

    pdf.save(`reporte_indexacion_visual_${Date.now()}.pdf`);
  };

  return (
    <div className="container" ref={reportRef}>
      {activeView === "main" ? (
        <>
          <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
            <button
              onClick={() => setActiveView("main")}
              style={{
                backgroundColor: activeView === "main" ? "#007bff" : "#ccc",
                color: "white",
                padding: "0.5rem 1rem",
                border: "none",
                borderRadius: "5px",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              Indexación
            </button>
            <button
              onClick={() => setActiveView("split")}
              style={{
                backgroundColor: activeView === "split" ? "#28a745" : "#ccc",
                color: "white",
                padding: "0.5rem 1rem",
                border: "none",
                borderRadius: "5px",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              Dividir Excel
            </button>
          </div>

          <h1>SIMAN | Gestor de Indexación de Productos</h1>

          <div
            className={`upload-area ${isProcessing ? "disabled" : ""}`}
            onClick={!isProcessing ? triggerFileInput : undefined}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple
              accept=".xls,.xlsx"
              style={{ display: "none" }}
              disabled={isProcessing}
            />
            <div className="upload-icon">
              {isProcessing ? (
                <div className="spinner"></div>
              ) : (
                <svg width="50" height="50" viewBox="0 0 24 24">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
              )}
            </div>
            {isProcessing ? (
              <p>Procesando archivos...</p>
            ) : (
              <>
                <p>Haz clic para agregar archivos Excel aquí</p>
                {files.length > 0 && (
                  <div className="file-list">
                    <p>Archivos seleccionados: {files.length}</p>
                  </div>
                )}
              </>
            )}
          </div>

          <button
            onClick={processFiles}
            disabled={isProcessing || files.length === 0}
            className={`process-button ${isProcessing ? "processing" : ""}`}
          >
            {isProcessing ? (
              <>
                <span className="button-spinner"></span>
                Procesando...
              </>
            ) : (
              "Iniciar Procesamiento"
            )}
          </button>

          <div className="progress-container">
            <div className="progress-info">
              {isProcessing && currentFile && (
                <span className="current-file">Procesando: {currentFile}</span>
              )}
              {totalCount > 0 && (
                <span className="count-info">
                  {formatNumber(processedCount)} / {formatNumber(totalCount)}
                </span>
              )}
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <div className="progress-text">{progress}%</div>
          </div>

          <div className="status-box">
            <h3>Estado:</h3>
            <p>{status}</p>
            {uniqueIdsCount > 0 && (
              <p>IDs únicos encontrados: {formatNumber(uniqueIdsCount)}</p>
            )}
          </div>

          <div className="log-container">
            <div className="log-header">
              <h3>Registro de actividad</h3>
              <button
                onClick={() => setLogs([])}
                className="clear-logs"
                disabled={logs.length === 0}
              >
                Limpiar
              </button>
            </div>
            <div className="log-content">
              {logs.length === 0 ? (
                <p className="empty-logs">No hay actividad para mostrar</p>
              ) : (
                logs.map((log, index) => (
                  <p
                    key={index}
                    className={log.startsWith("ERROR:") ? "error-log" : ""}
                  >
                    {log}
                  </p>
                ))
              )}
            </div>
          </div>

          {!isProcessing && progress === 100 && (
            <div
              className="reset-container"
              style={{ marginTop: "1rem", textAlign: "center" }}
            >
              <button
                onClick={resetForm}
                className="reset-button"
                style={{
                  backgroundColor: "#007bff",
                  color: "white",
                  padding: "0.6rem 1.2rem",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  marginRight: "1rem",
                }}
              >
                Nueva indexación
              </button>
              <button
                onClick={generatePDFReport}
                className="reset-button"
                style={{
                  backgroundColor: "#28a745",
                  color: "white",
                  padding: "0.6rem 1.2rem",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  marginRight: "1rem",
                }}
              >
                Generar reporte
              </button>
              <button
                onClick={() => setActiveView("split")}
                className="reset-button"
                style={{
                  backgroundColor: "#6c757d",
                  color: "white",
                  padding: "0.6rem 1.2rem",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                Dividir archivos por bloques
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <MultiSplitProcessor />
          <div style={{ textAlign: "center", marginTop: "1rem" }}>
            <button
              onClick={() => setActiveView("main")}
              className="reset-button"
              style={{
                backgroundColor: "#007bff",
                color: "white",
                padding: "0.6rem 1.2rem",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              Volver
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default FileProcessor;
