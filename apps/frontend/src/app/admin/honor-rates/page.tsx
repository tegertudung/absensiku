"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import Modal from "@/components/Modal";
import PageHeader from "@/components/PageHeader";
import SectionCard from "@/components/SectionCard";
import EmptyState from "@/components/EmptyState";
import { formatDate, formatRupiah } from "@/lib/format";
import { IconPlus } from "@/components/icons";
type P = {
  id: string;
  code: string;
  name: string;
  learningModel: string;
  usesQuota: boolean;
  defaultMeetingQuota: number;
  isActive: boolean;
};
type R = {
  id: string;
  sessionType: string;
  nominal: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  program?: P | null;
};
type H = {
  id: string;
  oldNominal: string | null;
  newNominal: string;
  changedAt: string;
  reason?: string | null;
  rate: { program?: P | null };
};
const core = (p: P) => p.code === "REGULAR" || p.code === "PRIVATE";
const model = (p: P) =>
  p.learningModel === "CLASS_BASED" ? "Berbasis Kelas" : "Individual";
const empty = {
  name: "",
  code: "",
  learningModel: "INDIVIDUAL",
  usesQuota: true,
  defaultMeetingQuota: "24",
};
const err = (e: any, f: string) =>
  e.response?.data?.message ||
  Object.values(e.response?.data?.details || {})
    .flat()
    .find(Boolean) ||
  f;
export default function AdminHonorRatesPage() {
  const [programs, setPrograms] = useState<P[]>([]),
    [rates, setRates] = useState<R[]>([]),
    [history, setHistory] = useState<H[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [filter, setFilter] = useState(""),
    [menu, setMenu] = useState<string | null>(null),
    [programOpen, setProgramOpen] = useState(false),
    [editing, setEditing] = useState<P | null>(null),
    [detail, setDetail] = useState<P | null>(null),
    [deactivate, setDeactivate] = useState<P | null>(null),
    [deleting, setDeleting] = useState<P | null>(null),
    [rateProgram, setRateProgram] = useState<P | null>(null),
    [saving, setSaving] = useState(false),
    [form, setForm] = useState(empty),
    [rateForm, setRateForm] = useState({ nominal: "", effectiveFrom: "" });
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [p, r, h] = await Promise.all([
        api.get("/programs"),
        api.get("/honor-rates"),
        api.get("/honor-rates/history"),
      ]);
      setPrograms(p.data.data);
      setRates(r.data.data);
      setHistory(h.data.data);
    } catch (e: any) {
      setError(err(e, "Gagal memuat data Program."));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const today = new Date();
  const current = (p: P) =>
    rates.find(
      (r) =>
        r.program?.id === p.id &&
        r.status === "ACTIVE" &&
        new Date(r.effectiveFrom) <= today &&
        (!r.effectiveTo || new Date(r.effectiveTo) >= today),
    );
  const futures = (p: P) =>
    rates.filter(
      (r) =>
        r.program?.id === p.id &&
        r.status === "ACTIVE" &&
        new Date(r.effectiveFrom) > today,
    );
  const visible = useMemo(
    () => programs.filter((p) => !filter || p.id === filter),
    [programs, filter],
  );
  const active = rates.filter(
    (r) =>
      r.status === "ACTIVE" &&
      new Date(r.effectiveFrom) <= today &&
      (!r.effectiveTo || new Date(r.effectiveTo) >= today),
  );
  const future = rates.filter(
    (r) => r.status === "ACTIVE" && new Date(r.effectiveFrom) > today,
  );
  function open(p?: P) {
    setProgramOpen(true);
    setEditing(p || null);
    setForm(
      p
        ? {
            name: p.name,
            code: p.code,
            learningModel: p.learningModel,
            usesQuota: p.usesQuota,
            defaultMeetingQuota: String(p.defaultMeetingQuota),
          }
        : empty,
    );
    setError("");
  }
  async function saveProgram(e: React.FormEvent) {
    e.preventDefault();
    const q = Number(form.defaultMeetingQuota);
    if (
      !form.name.trim() ||
      (!editing && !form.code.trim()) ||
      !Number.isInteger(q) ||
      q < 1
    ) {
      setError(
        "Nama, kode, dan kuota standar minimal 1 pertemuan wajib diisi.",
      );
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        learningModel: form.learningModel,
        usesQuota: form.usesQuota,
        defaultMeetingQuota: q,
      };
      editing
        ? await api.put(`/programs/${editing.id}`, data)
        : await api.post("/programs", {
            ...data,
            code: form.code.trim().toUpperCase(),
          });
      setEditing(null);
      setNotice("Program berhasil disimpan.");
      await load();
    } catch (e: any) {
      setError(err(e, "Gagal menyimpan program."));
    } finally {
      setSaving(false);
    }
  }
  async function status(p: P) {
    setSaving(true);
    try {
      await api.patch(`/programs/${p.id}/status`, { isActive: !p.isActive });
      setDeactivate(null);
      setNotice(
        `Program berhasil ${p.isActive ? "dinonaktifkan" : "diaktifkan"}.`,
      );
      await load();
    } catch (e: any) {
      setError(err(e, "Gagal mengubah status program."));
    } finally {
      setSaving(false);
    }
  }
  async function remove(p: P) {
    setSaving(true);
    try {
      await api.delete(`/programs/${p.id}`);
      setDeleting(null);
      setDetail(null);
      setNotice("Program berhasil dihapus.");
      await load();
    } catch (e: any) {
      setDeleting(null);
      setError(
        err(
          e,
          "Program tidak dapat dihapus karena sudah digunakan pada data operasional. Nonaktifkan program jika sudah tidak ingin digunakan.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }
  async function saveRate(e: React.FormEvent) {
    e.preventDefault();
    if (
      !rateProgram ||
      Number(rateForm.nominal) <= 0 ||
      !rateForm.effectiveFrom
    ) {
      setError("Honor per sesi dan tanggal berlaku wajib diisi.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/honor-rates", {
        programId: rateProgram.id,
        sessionType: rateProgram.code,
        nominal: Number(rateForm.nominal),
        effectiveFrom: rateForm.effectiveFrom,
      });
      setRateProgram(null);
      setNotice("Tarif honor berhasil disimpan.");
      await load();
    } catch (e: any) {
      setError(err(e, "Gagal menyimpan tarif honor."));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-5">
      <PageHeader
        title="Program"
        description="Kelola program pembelajaran dan tarif honor tentor."
        action={
          <button
            onClick={() => open()}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-900 px-4 text-sm font-medium text-white"
          >
            <IconPlus className="h-4 w-4" />
            Tambah Program
          </button>
        }
      />
      <div className="grid grid-cols-3 gap-3">
        <Metric
          label="Program Aktif"
          value={programs.filter((p) => p.isActive).length}
        />
        <Metric label="Tarif Berlaku" value={active.length} />
        <Metric label="Akan Berlaku" value={future.length} />
      </div>
      {notice && <Notice text={notice} />}{" "}
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <SectionCard
        title="Daftar Program"
        description="Kelola program pembelajaran yang tersedia di Pioner Class."
        action={
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-9 rounded-md border border-gray-300 px-3 text-xs"
          >
            <option value="">Semua Program</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        }
      >
        {loading ? (
          <div className="h-36 animate-pulse rounded-md bg-slate-100" />
        ) : visible.length === 0 ? (
          <EmptyState
            title="Belum ada program"
            message="Tambahkan program pembelajaran untuk memulai."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-gray-500">
                  <th className="px-4 py-3">Program</th>
                  <th>Model</th>
                  <th>Kuota</th>
                  <th>Honor / Sesi</th>
                  <th>Berlaku Mulai</th>
                  <th>Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const r = core(p) ? current(p) : undefined;
                  return (
                    <tr key={p.id} className="border-b border-gray-100">
                      <td className="px-4 py-3 font-medium">
                        {p.name}
                        <small className="block text-xs text-gray-500">
                          {p.code}
                        </small>
                      </td>
                      <td>{model(p)}</td>
                      <td>
                        {p.usesQuota
                          ? `${p.defaultMeetingQuota} pertemuan`
                          : "Tanpa kuota"}
                      </td>
                      <td>{r ? formatRupiah(r.nominal) : "—"}</td>
                      <td>{r ? formatDate(r.effectiveFrom) : "—"}</td>
                      <td>
                        <Badge active={p.isActive} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="relative inline-block">
                          <button
                            onClick={() => setMenu(menu === p.id ? null : p.id)}
                            className="rounded-md px-2 py-1 text-lg text-gray-500"
                          >
                            •••
                          </button>
                          {menu === p.id && (
                            <div className="absolute right-0 z-10 mt-1 w-44 rounded-md border bg-white p-1 text-left shadow-lg">
                              <button
                                onClick={() => {
                                  setDetail(p);
                                  setMenu(null);
                                }}
                                className="item"
                              >
                                Lihat Detail
                              </button>
                              <button
                                onClick={() => {
                                  open(p);
                                  setMenu(null);
                                }}
                                className="item"
                              >
                                Edit Program
                              </button>
                              <button
                                onClick={() => {
                                  setMenu(null);
                                  p.isActive ? setDeactivate(p) : status(p);
                                }}
                                className="item"
                              >
                                {p.isActive
                                  ? "Nonaktifkan Program"
                                  : "Aktifkan Program"}
                              </button>
                              {!core(p) && (
                                <button
                                  onClick={() => {
                                    setDeleting(p);
                                    setMenu(null);
                                  }}
                                  className="item text-red-600"
                                >
                                  Hapus Program
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
      <SectionCard
        title="Riwayat Tarif Honor"
        description="Riwayat perubahan tarif honor berdasarkan program dan tanggal berlaku."
      >
        {history.length ? (
          <div className="divide-y">
            {history.map((h) => (
              <div
                key={h.id}
                className="grid gap-2 py-3 text-sm md:grid-cols-[130px_1fr_180px]"
              >
                <p>{formatDate(h.changedAt)}</p>
                <div>
                  <b>{h.rate.program?.name || "—"}</b>
                  <p className="text-xs">
                    {h.oldNominal ? `${formatRupiah(h.oldNominal)} → ` : ""}
                    {formatRupiah(h.newNominal)}
                  </p>
                </div>
                <p className="text-xs">{h.reason || "Tarif diperbarui"}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="Belum ada riwayat perubahan tarif." />
        )}
      </SectionCard>
      {programOpen && (
        <Modal
          title={editing ? "Edit Program" : "Tambah Program"}
          onClose={() =>
            !saving && (setEditing(null), setForm(empty), setProgramOpen(false))
          }
        >
          <form onSubmit={saveProgram} className="space-y-4">
            <Field
              label="Nama Program"
              value={form.name}
              onChange={(v) => setForm({ ...form, name: v })}
            />
            <Field
              label="Kode Program"
              value={form.code}
              disabled={!!editing}
              onChange={(v) => setForm({ ...form, code: v.toUpperCase() })}
            />
            <label className="block text-xs font-medium">
              Model Pembelajaran
              <select
                value={form.learningModel}
                onChange={(e) =>
                  setForm({ ...form, learningModel: e.target.value })
                }
                className="mt-1 h-10 w-full rounded-md border px-3"
              >
                <option value="INDIVIDUAL">Individual</option>
                <option value="CLASS_BASED">Berbasis Kelas</option>
              </select>
            </label>
            <label className="flex gap-2 text-xs">
              <input
                type="checkbox"
                checked={form.usesQuota}
                onChange={(e) =>
                  setForm({ ...form, usesQuota: e.target.checked })
                }
              />
              Program menggunakan kuota pertemuan
            </label>
            <Field
              label="Kuota Standar"
              type="number"
              value={form.defaultMeetingQuota}
              onChange={(v) => setForm({ ...form, defaultMeetingQuota: v })}
            />
            <Buttons
              saving={saving}
              label={editing ? "Simpan Perubahan" : "Tambah Program"}
              cancel={() => {
                setEditing(null);
                setForm(empty);
                setProgramOpen(false);
              }}
            />
          </form>
        </Modal>
      )}
      {detail && (
        <Modal
          title="Detail Program"
          onClose={() => setDetail(null)}
          className="max-w-[680px]"
        >
          <div className="space-y-4">
            <Info label="Nama" value={detail.name} />
            <Info label="Kode" value={detail.code} />
            <Info label="Model" value={model(detail)} />
            <Info
              label="Kuota"
              value={
                detail.usesQuota
                  ? `${detail.defaultMeetingQuota} pertemuan`
                  : "Tanpa kuota"
              }
            />
            <Info
              label="Status"
              value={detail.isActive ? "Aktif" : "Nonaktif"}
            />
            <div className="border-t pt-4">
              <h4 className="font-semibold">Tarif Honor</h4>
              {core(detail) ? (
                <>
                  <Info
                    label="Tarif Berlaku"
                    value={
                      current(detail)
                        ? `${formatRupiah(current(detail)!.nominal)} · ${formatDate(current(detail)!.effectiveFrom)}`
                        : "Belum diatur"
                    }
                  />
                  {futures(detail).map((r) => (
                    <Info
                      key={r.id}
                      label="Akan Berlaku"
                      value={`${formatRupiah(r.nominal)} · ${formatDate(r.effectiveFrom)}`}
                    />
                  ))}
                  <button
                    onClick={() => {
                      setRateForm({ nominal: "", effectiveFrom: "" });
                      setRateProgram(detail);
                    }}
                    className="mt-4 rounded-md bg-navy-900 px-4 py-2 text-sm text-white"
                  >
                    + Atur Tarif Baru
                  </button>
                  <div className="mt-4 text-xs">
                    {history
                      .filter((h) => h.rate.program?.id === detail.id)
                      .map((h) => (
                        <p key={h.id}>
                          {formatDate(h.changedAt)} ·{" "}
                          {formatRupiah(h.newNominal)} ·{" "}
                          {h.reason || "Tarif diperbarui"}
                        </p>
                      ))}
                  </div>
                </>
              ) : (
                <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-gray-600">
                  Tarif honor untuk program ini belum dapat dikonfigurasi.
                  Dukungan tarif program dinamis belum tersedia pada alur
                  operasional saat ini.
                </p>
              )}
            </div>
          </div>
        </Modal>
      )}
      {rateProgram && (
        <Modal
          title="Atur Tarif Baru"
          onClose={() => !saving && setRateProgram(null)}
        >
          <form onSubmit={saveRate} className="space-y-4">
            <p className="text-sm">
              Program: <b>{rateProgram.name}</b>
            </p>
            <Field
              label="Honor per Sesi"
              type="number"
              value={rateForm.nominal}
              onChange={(v) => setRateForm({ ...rateForm, nominal: v })}
            />
            <Field
              label="Berlaku Mulai"
              type="date"
              value={rateForm.effectiveFrom}
              onChange={(v) => setRateForm({ ...rateForm, effectiveFrom: v })}
            />
            <Buttons
              saving={saving}
              label="Simpan Tarif"
              cancel={() => setRateProgram(null)}
            />
          </form>
        </Modal>
      )}
      {deactivate && (
        <Confirm
          title="Nonaktifkan Program?"
          text="Program akan ditandai sebagai tidak aktif dan tetap tersimpan dalam sistem."
          action="Nonaktifkan"
          saving={saving}
          cancel={() => setDeactivate(null)}
          confirm={() => status(deactivate)}
        />
      )}{" "}
      {deleting && (
        <Confirm
          title="Hapus Program?"
          text="Program akan dihapus secara permanen jika belum pernah digunakan pada data operasional. Tindakan ini tidak dapat dibatalkan."
          action="Hapus Program"
          saving={saving}
          danger
          cancel={() => setDeleting(null)}
          confirm={() => remove(deleting)}
        />
      )}
    </div>
  );
}
function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}
function Notice({ text }: { text: string }) {
  return (
    <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
      {text}
    </p>
  );
}
function Badge({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}
    >
      {active ? "Aktif" : "Nonaktif"}
    </span>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t pt-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block text-xs font-medium">
      {label}
      <input
        required
        type={type}
        min={type === "number" ? 1 : undefined}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-10 w-full rounded-md border px-3 disabled:bg-slate-100"
      />
    </label>
  );
}
function Buttons({
  saving,
  label,
  cancel,
}: {
  saving: boolean;
  label: string;
  cancel: () => void;
}) {
  return (
    <div className="flex justify-end gap-2 border-t pt-4">
      <button
        type="button"
        onClick={cancel}
        className="rounded-md border px-4 py-2 text-sm"
      >
        Batal
      </button>
      <button
        disabled={saving}
        className="rounded-md bg-navy-900 px-4 py-2 text-sm text-white"
      >
        {saving ? "Menyimpan..." : label}
      </button>
    </div>
  );
}
function Confirm({
  title,
  text,
  action,
  saving,
  danger = false,
  cancel,
  confirm,
}: {
  title: string;
  text: string;
  action: string;
  saving: boolean;
  danger?: boolean;
  cancel: () => void;
  confirm: () => void;
}) {
  return (
    <Modal title={title} onClose={cancel}>
      <p className="text-sm text-gray-600">{text}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={cancel}
          className="rounded-md border px-4 py-2 text-sm"
        >
          Batal
        </button>
        <button
          disabled={saving}
          onClick={confirm}
          className={`rounded-md px-4 py-2 text-sm text-white ${danger ? "bg-red-600" : "bg-navy-900"}`}
        >
          {action}
        </button>
      </div>
    </Modal>
  );
}
