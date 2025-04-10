// src/workers/fileProcessor.worker.js
import * as XLSX from 'xlsx';

self.onmessage = async function (e) {
  const { files, endpointUrl, action } = e.data;

  if (action === 'deduplicate') {
    await deduplicateFiles(files);
  } else if (action === 'processRequests') {
    await processRequests(e.data.uniqueIds, endpointUrl);
  }
};

async function deduplicateFiles(files) {
  const possibleColumns = ["_ProductId (Not changeable)"];
  const uniqueIds = new Set();
  let processedCount = 0;

  for (const file of files) {
    try {
      const data = await readExcelFile(file);
      const matchedColumn = possibleColumns.find(col =>
        data.some(row => col in row)
      );

      if (matchedColumn) {
        data.forEach(row => {
          if (row[matchedColumn]) {
            uniqueIds.add(String(row[matchedColumn]));
          }
        });
      }

      processedCount++;
      self.postMessage({
        type: 'progress',
        progress: Math.round((processedCount / files.length) * 100),
        currentFile: file.name
      });
    } catch (error) {
      self.postMessage({
        type: 'error',
        message: `Error procesando ${file.name}: ${error.message}`
      });
    }
  }

  self.postMessage({
    type: 'deduplicateComplete',
    uniqueIds: Array.from(uniqueIds),
    uniqueIdsCount: uniqueIds.size
  });
}

async function processRequests(uniqueIds, endpointUrl) {
  const batchSize = 50;
  const retries = 3;
  const failedRequests = [];
  let processedCount = 0;

  for (let i = 0; i < uniqueIds.length; i += batchSize) {
    const batch = uniqueIds.slice(i, i + batchSize);
    const requests = batch.map(productId =>
      sendRequestWithRetry(productId, endpointUrl, retries)
    );

    const results = await Promise.allSettled(requests);
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        failedRequests.push(`${batch[index]} - Error: ${result.reason}`);
      }
    });

    processedCount += batch.length;
    self.postMessage({
      type: 'progress',
      progress: Math.round((processedCount / uniqueIds.length) * 100),
      processedCount,
      totalCount: uniqueIds.length
    });
  }

  self.postMessage({
    type: 'processComplete',
    failedRequests,
    successCount: uniqueIds.length - failedRequests.length
  });
}

async function sendRequestWithRetry(productId, endpointUrl, maxRetries) {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const payload = {
        idSku: "string",
        productId,
        an: "string",
        idAffiliate: "string",
        sellerChain: "string",
        dateModified: new Date().toISOString(),
        stockModified: true,
        priceModified: true,
        hasStockKeepingUnitModified: true,
        hasStockKeepingUnitRemovedFromAffiliate: true,
        active: true
      };

      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          "accept": "*/*",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) return;

      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }

    if (attempt < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  throw lastError;
}

async function readExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = function (e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        resolve(jsonData);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
