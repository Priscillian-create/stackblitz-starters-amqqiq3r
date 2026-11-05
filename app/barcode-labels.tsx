"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { barcodeModules } from "./barcode";

export function BarcodeLabels({ product, price, onClose }: {
  product: { name: string; barcode: string }; price: string; onClose: () => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const [copies, setCopies] = useState(1);
  const [width, setWidth] = useState(50);
  const [height, setHeight] = useState(28);
  const [printError, setError] = useState("");
  const encoded = useMemo(() => { try { return barcodeModules(product.barcode); } catch { return null; } }, [product.barcode]);
  const error = !encoded ? "This item needs a valid barcode using standard letters, numbers or symbols." : printError;
  useEffect(() => {
    if (!encoded) return;
    {
      const node = svg.current!;
      node.replaceChildren();
      node.setAttribute("viewBox", `0 0 ${encoded.width} 42`);
      node.setAttribute("preserveAspectRatio", "none");
      node.setAttribute("shape-rendering", "crispEdges");
      for (const bar of encoded.bars) {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", String(bar.x)); rect.setAttribute("y", "0");
        rect.setAttribute("width", String(bar.width)); rect.setAttribute("height", "42");
        rect.setAttribute("fill", "black"); node.appendChild(rect);
      }
    }
  }, [encoded]);
  const valid = Number.isInteger(copies) && copies >= 1 && copies <= 500 && Number.isFinite(width) && width >= 40 && width <= 100 && Number.isFinite(height) && height >= 28 && height <= 100;
  const contentWidth = width - 2;
  const contentHeight = height - 5;
  const styles = `*{box-sizing:border-box}.barcode-label{position:relative;width:${contentWidth}mm;height:${contentHeight}mm;padding:1.5mm .5mm .5mm;background:white;color:black;display:grid;grid-template-rows:3mm 5mm auto minmax(0, 1fr) 2.7mm;gap:.6mm;align-items:center;justify-items:center;overflow:hidden;font-family:Arial,sans-serif;text-align:center}.barcode-brand{display:block;width:100%;font-family:Arial,sans-serif;font-size:7pt;font-weight:900;line-height:1.2;text-align:center;color:#000;white-space:nowrap;overflow:hidden}.barcode-name{font-size:9pt;font-weight:700;line-height:1.05;width:100%;max-height:100%;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}.barcode-price{font-size:${width < 50 ? 12 : 14}pt;font-weight:900;line-height:1;white-space:nowrap;max-width:100%;overflow:hidden;letter-spacing:-.5pt}.barcode-number{display:block;font-size:8pt;font-weight:700;line-height:1.15;white-space:nowrap;text-align:center;max-width:100%;overflow:hidden;align-self:start}.barcode-label svg{display:block;width:100%;height:100%;min-height:0;max-height:100%}`;
  function print() {
    if (!valid || error || !label.current) return;
    const popup = window.open("", "_blank", "width=650,height=600");
    if (!popup) { setError("Allow pop-ups for this site, then try printing again."); return; }
    const doc = popup.document;
    doc.open();
    doc.write(`<!doctype html><html><head><title>Barcode labels</title><style>${styles}@page{size:${width}mm ${height}mm;margin:0}html,body{margin:0!important;padding:0!important;width:${width}mm}body{font-size:0;line-height:0}.label-page{position:relative;display:block;width:${width}mm;height:${height - 4}mm;margin:0;padding:0;overflow:hidden;break-inside:avoid;page-break-inside:avoid;break-after:auto;page-break-after:auto}.label-page+.label-page{break-before:page;page-break-before:always}.label-page .barcode-label{position:absolute;top:0;left:1mm;width:${contentWidth}mm;height:${contentHeight}mm;margin:0;print-color-adjust:exact;-webkit-print-color-adjust:exact}</style></head><body></body></html>`);
    doc.close();
    for (let i = 0; i < copies; i++) {
      const page = doc.createElement("div");
      page.className = "label-page";
      page.appendChild(label.current.cloneNode(true));
      doc.body.appendChild(page);
    }
    popup.focus();
    popup.requestAnimationFrame(() => popup.requestAnimationFrame(() => popup.print()));
  }
  return <div className="product-modal" role="dialog" aria-modal="true" aria-labelledby="barcode-title" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
    <section className="form-panel" style={{ width: "min(560px, 95vw)", maxHeight: "90vh", overflow: "auto" }}>
      <h2 id="barcode-title">Print barcode labels</h2>
      <p>For your Xprinter, set the printer paper size to match the width and height below (50 × 28 mm by default). Content fits inside this page, aligned at the top with space below. Print at 100% scale with margins and headers/footers turned off.</p>
      <div className="two-col">
        <label>Width (mm)<input className="input" type="number" min="40" max="100" value={width} onChange={e => setWidth(Number(e.target.value))} /></label>
        <label>Height (mm)<input className="input" type="number" min="28" max="100" value={height} onChange={e => setHeight(Number(e.target.value))} /></label>
      </div>
      <p>Printed content: {contentWidth} × {contentHeight} mm</p>
      <label>Copies<input className="input" type="number" min="1" max="500" step="1" value={copies} onChange={e => setCopies(Number(e.target.value))} /></label>
      {!valid && <p role="alert">Use 1–500 whole copies, width 40–100 mm and height 28–100 mm.</p>}
      {error && <p role="alert">{error}</p>}
      <style>{styles}</style>
      <div style={{ overflow: "auto", padding: "12px", background: "#e5e7eb", margin: "12px 0" }}>
        <div ref={label} className="barcode-label">
          <span className="barcode-brand">PA GERRYS MART</span>
          <div className="barcode-name">{product.name}</div>
          <div className="barcode-price" style={{ fontSize: price.length > 12 ? "11pt" : undefined }}>{price}</div>
          <svg ref={svg} role="img" aria-label={`Barcode ${product.barcode}`} />
          <div className="barcode-number">{product.barcode}</div>
        </div>
      </div>
      <div className="inventory-row-actions">
        <button className="secondary-button" onClick={onClose}>Close</button>
        <button className="primary-button" disabled={!valid || !!error} onClick={print}>Print labels</button>
      </div>
    </section>
  </div>;
}
