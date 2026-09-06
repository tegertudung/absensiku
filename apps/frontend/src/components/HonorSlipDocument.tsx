"use client";

import { assetUrl } from "@/lib/api";
import { formatRupiah } from "@/lib/format";

export interface HonorSlipData {
  tutor: { name: string; title: string | null };
  month: number;
  year: number;
  rows: Array<{ program: string; sessions: number; rate: string | number; subtotal: number }>;
  totalSessions: number;
  totalHonor: number;
  settings: Record<string, string>;
}

/**
 * Shared by the admin ("/admin/recap/slip/[tutorId]") and tentor
 * ("/tentor/recap/slip") print-preview pages. Same logo/signature pattern
 * as StudentLetterDocument — pulled from Settings via assetUrl, with
 * "/logo.png" as the fallback — because the honor slip used to be rendered
 * through a separate hand-rolled raw-PDF byte generator that only ever
 * drew text, so it never picked up either even after Settings supported
 * uploading them for the (unrelated) Surat Siswa flow. Printing this page
 * (window.print -> Save as PDF) replaces that generator entirely.
 */
export default function HonorSlipDocument({ slip }: { slip: HonorSlipData }) {
  const institutionName = slip.settings.institutionName || slip.settings.systemName || "Pioneer Class";
  const logo = assetUrl(slip.settings.logoPath) || "/logo.png";
  const signerName = slip.settings.signatoryName || "";
  const signerTitle = slip.settings.signatoryTitle || "";
  const signature = assetUrl(slip.settings.signaturePath);
  const period = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(
    new Date(slip.year, slip.month - 1, 1),
  );
  const printed = new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(new Date());

  return (
    <article className="slip-page mx-auto min-h-[1075px] w-[760px] bg-white p-14 shadow-sm">
      <header className="border-b-2 border-navy-900 pb-6 text-center">
        <img
          src={logo}
          alt="Logo lembaga"
          className="mx-auto mb-3 h-11 w-11 rounded-lg object-cover"
          onError={(event) => {
            event.currentTarget.src = "/logo.png";
          }}
        />
        <h1 className="text-2xl font-bold text-navy-900">{institutionName}</h1>
        <p className="mt-5 text-lg font-bold text-navy-900">SLIP HONOR TENTOR</p>
        <p className="mt-1 text-sm">
          Periode: <b>{period}</b>
        </p>
      </header>
      <div className="mt-7 grid grid-cols-2 gap-6 text-sm">
        <p>
          Periode
          <br />
          <b>{period}</b>
          <br />
          <br />
          Tentor
          <br />
          <b>
            {slip.tutor.name}
            {slip.tutor.title ? `, ${slip.tutor.title}` : ""}
          </b>
        </p>
        <p className="text-right">
          Tanggal Cetak
          <br />
          <b>{printed}</b>
        </p>
      </div>
      <table className="mt-7 w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-100 text-left">
            <th className="border p-2">No</th>
            <th className="border p-2">Program</th>
            <th className="border p-2">Jumlah Sesi</th>
            <th className="border p-2">Honor / Sesi</th>
            <th className="border p-2">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {slip.rows.map((row, index) => (
            <tr key={index}>
              <td className="border p-2">{index + 1}</td>
              <td className="border p-2">{row.program}</td>
              <td className="border p-2">{row.sessions} sesi</td>
              <td className="border p-2">{formatRupiah(row.rate)}</td>
              <td className="border p-2">{formatRupiah(row.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-5 border p-3 text-sm">
        <div className="flex justify-between">
          <b>TOTAL SESI</b>
          <b>{slip.totalSessions} sesi</b>
        </div>
      </div>
      <div className="flex justify-between bg-navy-900 px-4 py-3 text-sm font-bold text-white">
        <span>TOTAL HONOR</span>
        <span>{formatRupiah(slip.totalHonor)}</span>
      </div>
      <div className="mt-12 text-right text-sm">
        {slip.settings.location || ""}, {printed}
      </div>
      <div className="mt-7 grid grid-cols-2 text-sm">
        <div>
          <p>Penanggung Jawab</p>
          <div className="flex h-24 items-end">
            {signature && (
              <img
                src={signature}
                alt="Tanda tangan penanggung jawab"
                className="h-20 object-contain"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
            )}
          </div>
          <p className="font-bold">{signerName}</p>
          <p>{signerTitle}</p>
        </div>
        <div className="text-right">
          <p>Tentor</p>
          <div className="h-24" />
          <p className="font-bold">{slip.tutor.name}</p>
          <p>{slip.tutor.title || ""}</p>
        </div>
      </div>
    </article>
  );
}
