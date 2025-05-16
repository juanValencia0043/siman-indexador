import React, { useState, useRef, useEffect } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import MultiSplitProcessor from "./assets/components/MultiSplitProcessor.jsx";

const QA_ENDPOINT =
  "https://omnicanalqa.siman.com/omnicanal/ecommerce/v1/webhook/items";
const PROD_ENDPOINT =
  "https://omnicanal.simanscs.com/omnicanal/ecommerce/v1/webhook/items";

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
  const [selectedCountry, setSelectedCountry] = useState("SV");
  const [selectedEnv, setSelectedEnv] = useState("QA");
  const [activeView, setActiveView] = useState("main");

  const fileInputRef = useRef(null);
  const reportRef = useRef(null);
  const workerRef = useRef(null);

  useEffect(() => {
    const workerInstance = new Worker(
      new URL("./assets/workers/fileProcessor.worker.js", import.meta.url),
      { type: "module" }
    );

    workerInstance.onmessage = (e) => {
      const { type, ...data } = e.data;

      switch (type) {
        case "progress":
          if (data.progress !== undefined) setProgress(data.progress);
          if (data.currentFile) setCurrentFile(data.currentFile);
          if (data.processedCount !== undefined)
            setProcessedCount(data.processedCount);
          if (data.totalCount !== undefined) setTotalCount(data.totalCount);
          break;
        case "deduplicateComplete":
          setUniqueIdsCount(data.uniqueIdsCount);
          setLogs((prev) => [
            ...prev,
            `Se encontraron ${formatNumber(
              data.uniqueIdsCount
            )} IDs únicos después de la deduplicación.`,
          ]);
          startProcessingRequests(data.uniqueIds);
          break;
        case "processComplete":
          setIsProcessing(false);
          setStatus("Proceso completado");
          setCurrentFile("");
          setLogs((prev) => [
            ...prev,
            "Procesamiento completado.",
            `Solicitudes exitosas: ${data.successCount}`,
            ...(data.failedRequests.length > 0
              ? [
                  `Errores (${data.failedRequests.length}):`,
                  ...data.failedRequests.slice(0, 10),
                ]
              : ["Todos los requests fueron exitosos"]),
          ]);
          break;
        case "error":
          setIsProcessing(false);
          setLogs((prev) => [...prev, `ERROR: ${data.message}`]);
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
    const endpoint = selectedEnv === "PROD" ? PROD_ENDPOINT : QA_ENDPOINT;

    setStatus("Enviando solicitudes...");
    setProgress(0);
    setTotalCount(uniqueIds.length);
    setProcessedCount(0);

    if (workerRef.current) {
      workerRef.current.postMessage({
        action: "processRequests",
        uniqueIds,
        endpointUrl: endpoint,
        country: selectedCountry,
      });
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

    workerRef.current.postMessage({
      action: "deduplicate",
      files: files,
    });
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

    const canvas = await html2canvas(input, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");

    const pageWidth = pdf.internal.pageSize.getWidth();
    const imgProps = pdf.getImageProperties(imgData);
    const imgHeight = (imgProps.height * pageWidth) / imgProps.width;

    pdf.addImage(imgData, "PNG", 0, 0, pageWidth, imgHeight);
    pdf.save(`reporte_indexacion_visual_${Date.now()}.pdf`);
  };

  const formatNumber = (num) =>
    num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  return (
    <div className="container" ref={reportRef}>
      {activeView === "main" ? (
        <>
          <div className="view-switch">
            <button className="btn-switch" onClick={() => setActiveView("main")}>Indexación</button>
            <button className="btn-switch" onClick={() => setActiveView("split")}>
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
                <svg
                  width="48"
                  height="48"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  viewBox="0 0 24 24"
                >
                  <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                  <polyline points="7 9 12 4 17 9" />
                  <line x1="12" y1="4" x2="12" y2="16" />
                </svg>
              )}
            </div>
            <p>
              {isProcessing
                ? "Procesando archivos..."
                : "Haz clic para subir archivos Excel"}
            </p>
          </div>

          <div className="selectors">
            <label className="settings-selector">
              País:
              <select
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                disabled={isProcessing}
              >
                <option value="SV">El Salvador</option>
                <option value="GT">Guatemala</option>
                <option value="CR">Costa Rica</option>
                <option value="NI">Nicaragua</option>
              </select>
            </label>

            <label className="settings-selector">
              Entorno:
              <select
                value={selectedEnv}
                onChange={(e) => setSelectedEnv(e.target.value)}
                disabled={isProcessing}
              >
                <option value="QA">QA</option>
                <option value="PROD">Producción</option>
              </select>
            </label>
          </div>

          <button
            onClick={processFiles}
            disabled={isProcessing || files.length === 0}
            className={`process-button ${isProcessing ? "processing" : ""}`}
          >
            {isProcessing ? "Procesando..." : "Iniciar Procesamiento"}
          </button>

          <div className="progress-container">
            <div className="progress-info">
              {isProcessing && currentFile && (
                <span>Procesando: {currentFile}</span>
              )}
              {totalCount > 0 && (
                <span>
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
              <button className="btn-switch" onClick={() => setLogs([])} disabled={logs.length === 0}>
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
            <div className="reset-container">
              <button onClick={resetForm}>Nueva indexación</button>
              <button onClick={generatePDFReport}>Generar reporte</button>
              <button onClick={() => setActiveView("split")}>
                Dividir archivos
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <MultiSplitProcessor />
          <div style={{ textAlign: "center", marginTop: "1rem" }}>
            <button className="btn-switch" onClick={() => setActiveView("main")}>Volver</button>
          </div>
        </>
      )}
    </div>
  );
};

export default FileProcessor;
