"use client";

import { useEffect, useState } from "react";
import api, { assetUrl } from "@/lib/api";

type Schedule = { meetingNumber: number; date: string; startTime: string; endTime: string };
export type StudentLetterDocumentData = { letterNumber: string; letterDate: string; studentName: string; studentNis: string; studentSchool: string; studentSchoolClass: string; programName: string; startDate: string; endDate: string; verificationCode: string; schedules: Schedule[] };

const dateText = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "UTC" }).format(new Date(value));
const dayText = (value: string) => new Intl.DateTimeFormat("id-ID", { weekday: "long", timeZone: "UTC" }).format(new Date(value));
export default function StudentLetterDocument({ letter }: { letter: StudentLetterDocumentData }) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  useEffect(() => {
    api.get("/settings").then((response) => setSettings(response.data.data || {})).catch(() => setSettings({}));
  }, []);
  const institutionName = settings.institutionName || settings.systemName || "Pioneer Class";
  const address = settings.address || "Bumi Tamalanrea Permai Blok L No. 291, Makassar Kode Pos : 190245";
  const email = settings.email || "pioneerclassnet@gmail.com";
  const phone = settings.phone || "+62 851 8333 4588";
  const signerName = settings.signatoryName || "Junianto Sesa, S.Si., M.Si.";
  const signerTitle = settings.signatoryTitle || "Pimpinan Pioneer Class";
  const issueCity = settings.location || "Makassar";
  const logo = assetUrl(settings.logoPath) || "/logo.png";
  return <article className="letter-document bg-white text-black" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
    <section className="letter-page">
      <header className="letterhead">
        <img src={logo} alt="Logo lembaga" className="letter-logo" onError={(event) => { event.currentTarget.src = "/logo.png"; }} />
        <div className="letterhead-copy"><p className="letterhead-institution">LEMBAGA BIMBINGAN BELAJAR</p><h1>{institutionName.toUpperCase()}</h1><p className="letterhead-address">{address}</p><p className="letterhead-contact">e-mail : {email} &nbsp;||&nbsp; {phone}</p></div>
      </header>
      <div className="letter-rule" />
      <h2 className="letter-title">SURAT KETERANGAN</h2>
      <p className="letter-number">Nomor: {letter.letterNumber}</p>
      <p className="letter-date">{issueCity}, {dateText(letter.letterDate)}</p>
      <div className="letter-body">
        <p>Dengan hormat,</p><p>Yang bertanda tangan di bawah ini:</p>
        <Identity rows={[["Nama", signerName], ["Jabatan", signerTitle], ["Alamat", address]]} />
        <p>Dengan ini menerangkan bahwa:</p>
        <Identity rows={[["Nama", letter.studentName], ["NIS", letter.studentNis], ["Kelas", letter.studentSchoolClass], ["Sekolah", letter.studentSchool]]} />
        <p className="letter-paragraph">Benar merupakan siswa kami yang saat ini mengikuti Program Private dalam rangka {letter.programName} di Pioneer Class sejak {dateText(letter.startDate)} hingga {dateText(letter.endDate)}, dengan jadwal kegiatan sebagaimana tercantum dalam lampiran surat ini.</p>
        <p>Demikian surat keterangan ini dibuat agar dipergunakan sebagaimana mestinya.</p>
      </div>
      <div className="signature-block"><p className="signature-role">{signerTitle}</p><div className="signature-mark">{settings.signaturePath && <img src={assetUrl(settings.signaturePath) || undefined} alt="Tanda tangan penanggung jawab" className="signature-image" onError={(event) => { event.currentTarget.style.display = "none"; }} />}</div><p className="signature-name">{signerName}</p></div>
    </section>
    <section className="letter-page letter-appendix">
      <h2 className="appendix-title">LAMPIRAN JADWAL PERTEMUAN</h2>
      <AttachmentMeta rows={[["Nomor Surat", letter.letterNumber], ["Nama", letter.studentName], ["NIS", letter.studentNis], ["Sekolah", letter.studentSchool], ["Kelas", letter.studentSchoolClass], ["Program", letter.programName], ["Periode", `${dateText(letter.startDate)} - ${dateText(letter.endDate)}`]]} />
      <table className="schedule-table"><thead><tr><th>No.</th><th>Tanggal</th><th>Hari</th><th>Waktu</th></tr></thead><tbody>{letter.schedules.map((s) => <tr key={s.meetingNumber}><td>{s.meetingNumber}</td><td>{dateText(s.date)}</td><td>{dayText(s.date)}</td><td>{s.startTime} - {s.endTime}</td></tr>)}</tbody></table>
    </section>
  </article>;
}

function Identity({ rows }: { rows: [string, string][] }) { return <dl className="letter-identity">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><span className="identity-separator">:</span><dd>{value}</dd></div>)}</dl>; }
function AttachmentMeta({ rows }: { rows: [string, string][] }) { return <table className="attachment-meta"><tbody>{rows.map(([label, value]) => <tr key={label}><td className="attachment-label">{label}</td><td className="attachment-separator">:</td><td>{value}</td></tr>)}</tbody></table>; }
