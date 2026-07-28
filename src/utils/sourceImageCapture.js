import JSZip from 'jszip';

const CARD_WIDTH = 1000;
const CARD_GAP = 32;
const PAGE_PADDING = 40;
const MAX_IMAGE_HEIGHT = 1200;
const MAX_CANVAS_HEIGHT = 15000;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Không thể đọc một trong các ảnh nguồn.'));
    image.src = url;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Không thể tạo ảnh chụp toàn cảnh.'));
    }, 'image/jpeg', 0.88);
  });
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function prepareCards(items, loadedImages) {
  return items.map((item, index) => {
    const image = loadedImages[index];
    const scaledHeight = Math.min(
      MAX_IMAGE_HEIGHT,
      Math.round((image.naturalHeight / image.naturalWidth) * CARD_WIDTH),
    );

    return {
      ...item,
      image,
      imageHeight: Math.max(1, scaledHeight),
      cardHeight: Math.max(1, scaledHeight),
    };
  });
}

function paginateRows(cards) {
  const rows = [];
  for (let index = 0; index < cards.length; index += 2) {
    const rowCards = cards.slice(index, index + 2);
    rows.push({
      cards: rowCards,
      height: Math.max(...rowCards.map((card) => card.cardHeight)),
    });
  }

  const pages = [];
  let currentPage = [];
  let currentHeight = PAGE_PADDING * 2;

  rows.forEach((row) => {
    const addedHeight = row.height + (currentPage.length ? CARD_GAP : 0);
    if (currentPage.length && currentHeight + addedHeight > MAX_CANVAS_HEIGHT) {
      pages.push(currentPage);
      currentPage = [];
      currentHeight = PAGE_PADDING * 2;
    }
    currentPage.push(row);
    currentHeight += row.height + (currentPage.length > 1 ? CARD_GAP : 0);
  });

  if (currentPage.length) pages.push(currentPage);
  return pages;
}

async function renderPage(rows) {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_PADDING * 2 + CARD_WIDTH * 2 + CARD_GAP;
  canvas.height = PAGE_PADDING * 2
    + rows.reduce((sum, row) => sum + row.height, 0)
    + Math.max(0, rows.length - 1) * CARD_GAP;

  const context = canvas.getContext('2d');
  context.fillStyle = '#eef2f7';
  context.fillRect(0, 0, canvas.width, canvas.height);

  let y = PAGE_PADDING;
  rows.forEach((row) => {
    row.cards.forEach((card, columnIndex) => {
      const x = PAGE_PADDING + columnIndex * (CARD_WIDTH + CARD_GAP);
      context.fillStyle = '#ffffff';
      context.fillRect(x, y, CARD_WIDTH, card.cardHeight);
      context.drawImage(card.image, x, y, CARD_WIDTH, card.imageHeight);

      const badgeX = x + 34;
      const badgeY = y + 34;
      context.beginPath();
      context.arc(badgeX, badgeY, 25, 0, Math.PI * 2);
      context.fillStyle = 'rgba(15, 23, 42, 0.88)';
      context.fill();
      context.fillStyle = '#ffffff';
      context.font = '800 25px Arial, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(String(card.index), badgeX, badgeY + 1);

      context.strokeStyle = '#cbd5e1';
      context.lineWidth = 2;
      context.strokeRect(x, y, CARD_WIDTH, card.cardHeight);
    });
    y += row.height + CARD_GAP;
  });

  return canvasToBlob(canvas);
}

export async function captureAndDownloadSourceImages(items) {
  if (!Array.isArray(items) || items.length === 0) return;

  const loadedImages = await Promise.all(items.map((item) => loadImage(item.url)));
  const cards = prepareCards(items, loadedImages);
  const pages = paginateRows(cards);
  const pageBlobs = [];

  for (const rows of pages) {
    pageBlobs.push(await renderPage(rows));
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (pageBlobs.length === 1) {
    downloadBlob(pageBlobs[0], `anh-nguon-toan-canh-${timestamp}.jpg`);
    return;
  }

  const zip = new JSZip();
  pageBlobs.forEach((blob, index) => {
    zip.file(`anh-nguon-toan-canh-${index + 1}.jpg`, blob);
  });
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(zipBlob, `anh-nguon-toan-canh-${timestamp}.zip`);
}
