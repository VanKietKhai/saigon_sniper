"use strict";

document.documentElement.dataset.labelerStage = "verified-image-loading";

const datasetConfigured = document.querySelector("#dataset-configured");
const manifestRecordCount = document.querySelector("#manifest-record-count");
const sourceIdStatus = document.querySelector("#source-id-status");
const identityStatus = document.querySelector("#identity-status");
const sourceIdInput = document.querySelector("#source-id-input");
const loadSourceButton = document.querySelector("#load-source");
const sourceImage = document.querySelector("#source-image");
const imageMessage = document.querySelector("#image-message");

async function loadHealth() {
  const response = await fetch("/health");
  if (!response.ok) throw new Error("Health request failed");
  const health = await response.json();
  datasetConfigured.textContent = health.dataset_configured ? "Yes" : "No";
  manifestRecordCount.textContent = String(health.manifest_record_count);
}

function resetImage(message) {
  sourceImage.hidden = true;
  sourceImage.removeAttribute("src");
  imageMessage.hidden = false;
  imageMessage.textContent = message;
}

async function loadSource() {
  const sourceId = sourceIdInput.value.trim();
  if (!sourceId) {
    identityStatus.textContent = "Enter a source ID";
    return;
  }

  resetImage("Checking source identity...");
  try {
    const response = await fetch(`/api/sources/${encodeURIComponent(sourceId)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail?.status || "source_not_found");

    sourceIdStatus.textContent = payload.source.source_id;
    identityStatus.textContent = payload.identity.status;
    if (payload.identity.status !== "verified") {
      resetImage(`Image unavailable: ${payload.identity.status}`);
      return;
    }

    sourceImage.src = `/api/sources/${encodeURIComponent(sourceId)}/image`;
    sourceImage.hidden = false;
    imageMessage.hidden = true;
  } catch (error) {
    identityStatus.textContent = error.message;
    resetImage("Image unavailable");
  }
}

loadSourceButton.addEventListener("click", loadSource);
loadHealth().catch(() => {
  datasetConfigured.textContent = "Unavailable";
  manifestRecordCount.textContent = "Unavailable";
});
