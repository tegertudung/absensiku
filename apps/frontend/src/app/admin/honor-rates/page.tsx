"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import Modal from "@/components/Modal";
import PageHeader from "@/components/PageHeader";
import SectionCard from "@/components/SectionCard";
import EmptyState from "@/components/EmptyState";
import { formatRupiah, formatDate } from "@/lib/format";
import { IconPlus } from "@/components/icons";

type Program = {
  id: string;
  code: string;
  name: string;
  learningModel?: string;
  isActive?: boolean;
};
type Rate = {
  id: string;
  sessionType: string;
  nominal: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  program?: Program | null;
};
type History = {
  id: string;
  oldNominal: string | null;
  newNominal: string;
  changedAt: string;
  reason?: string | null;
  rate: { sessionType: string; program?: Program | null };
};
const label = (rate: Rate | History["rate"]) =>
  rate.program?.name || (rate.sessionType === "PRIVATE" ? "Privat" : "Reguler");
const model = (rate: Rate) =>
  rate.program?.learningModel === "CLASS_BASED"
    ? "Berbasis Kelas"
    : rate.program?.learningModel === "INDIVIDUAL"
      ? "Individual"
      : "-";

export default function AdminHonorRatesPage() {
  const [rates, setRates] = useState<Rate[]>([]),
    [programs, setPrograms] = useState<Program[]>([]),
    [history, setHistory] = useState<History[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [open, setOpen] = useState(false),
    [saving, setSaving] = useState(false),
    [detail, setDetail] = useState<Rate | null>(null),
    [menu, setMenu] = useState<string | null>(null),
    [filter, setFilter] = useState("");
  const [form, setForm] = useState({
    programId: "",
    sessionType: "REGULAR",
    nominal: "",
    effectiveFrom: "",
    notes: "",
  });
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, b, c] = await Promise.all([
        api.get("/honor-rates"),
        api.get("/programs"),
        api.get("/honor-rates/history"),
      ]);
      setRates(a.data.data);
      setPrograms(b.data.data);
      setHistory(c.data.data);
    } catch {
      setError("Gagal memuat tarif honor.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const today = new Date();
  const visible = useMemo(
    () => rates.filter((r) => !filter || r.program?.id === filter),
    [rates, filter],
  );
  const active = visible.filter(
    (r) =>
      r.status === "ACTIVE" &&
      new Date(r.effectiveFrom) <= today &&
      (!r.effectiveTo || new Date(r.effectiveTo) >= today),
  );
  const future = visible.filter(
    (r) => r.status === "ACTIVE" && new Date(r.effectiveFrom) > today,
  );
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.programId || Number(form.nominal) <= 0 || !form.effectiveFrom) {
      setError("Program, honor per sesi, dan tanggal berlaku wajib diisi.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/honor-rates", {
        ...form,
        nominal: Number(form.nominal),
      });
      setOpen(false);
      setForm({
        programId: "",
        sessionType: "REGULAR",
        nominal: "",
        effectiveFrom: "",
        notes: "",
      });
      setNotice("Tarif honor berhasil disimpan.");
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || "Gagal menyimpan tarif honor.");
    } finally {
      setSaving(false);
    }
  }
  function openRate(rate?: Rate) {
    setForm({
      programId: rate?.program?.id || "",
      sessionType: rate?.sessionType || "REGULAR",
      nominal: rate ? String(rate.nominal) : "",
      effectiveFrom: "",
      notes: "",
    });
    setDetail(null);
    setOpen(true);
  }
  return (
    <div className="space-y-5">
      <PageHeader
        title="Master Honor"
        description="Kelola tarif honor tentor berdasarkan program dan tanggal berlaku."
        action={
          <button
            onClick={() => openRate()}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-900 px-4 text-sm font-medium text-white"
          >
            <IconPlus className="h-4 w-4" />
            Atur Tarif Baru
          </button>
        }
      />
      <div className="grid grid-cols-3 gap-3">
        <Metric
          label="Program Aktif"
          value={programs.filter((p) => p.isActive !== false).length}
        />
        <Metric label="Tarif Berlaku" value={active.length} />
        <Metric label="Akan Berlaku" value={future.length} />
      </div>
      {notice && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </p>
      )}
      {error && !open && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <SectionCard
        title="Tarif Honor Aktif"
        description="Tarif yang digunakan untuk sesi mengajar sesuai tanggal berlakunya."
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
            title="Belum ada tarif honor"
            message="Atur tarif honor berdasarkan program agar sesi selesai dapat menghitung honor."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-gray-500">
                  <th className="px-4 py-3">Program</th>
                  <th>Model</th>
                  <th>Honor / Sesi</th>
                  <th>Berlaku Mulai</th>
                  <th>Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((rate) => {
                  const isFuture =
                    rate.status === "ACTIVE" &&
                    new Date(rate.effectiveFrom) > today;
                  return (
                    <tr
                      key={rate.id}
                      className="border-b border-gray-100 last:border-0"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {label(rate)}
                      </td>
                      <td className="text-gray-600">{model(rate)}</td>
                      <td className="font-semibold text-gray-900">
                        {formatRupiah(rate.nominal)}
                      </td>
                      <td className="text-gray-600">
                        {formatDate(rate.effectiveFrom)}
                      </td>
                      <td>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${rate.status !== "ACTIVE" ? "bg-gray-100 text-gray-600" : isFuture ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}
                        >
                          {rate.status !== "ACTIVE"
                            ? "Tidak Aktif"
                            : isFuture
                              ? "Akan Berlaku"
                              : "Aktif"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="relative inline-block">
                          <button
                            onClick={() =>
                              setMenu(menu === rate.id ? null : rate.id)
                            }
                            className="rounded-md px-2 py-1 text-lg leading-none text-gray-500 hover:bg-gray-100"
                            aria-label={`Aksi ${label(rate)}`}
                          >
                            •••
                          </button>
                          {menu === rate.id && (
                            <div className="absolute right-0 z-10 mt-1 w-32 rounded-md border border-gray-200 bg-white p-1 text-left shadow-lg">
                              <button
                                onClick={() => {
                                  setDetail(rate);
                                  setMenu(null);
                                }}
                                className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-gray-50"
                              >
                                Detail
                              </button>
                              <button
                                onClick={() => {
                                  openRate(rate);
                                  setMenu(null);
                                }}
                                className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-gray-50"
                              >
                                Ubah Tarif
                              </button>
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
        title="Riwayat Perubahan Tarif"
        description="Riwayat perubahan tarif honor berdasarkan program dan tanggal berlaku."
      >
        {history.length === 0 ? (
          <p className="py-4 text-sm text-gray-500">
            Belum ada riwayat perubahan tarif.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {history.map((item) => (
              <div
                key={item.id}
                className="grid gap-2 py-3 text-sm md:grid-cols-[130px_1fr_180px]"
              >
                <p className="text-gray-500">{formatDate(item.changedAt)}</p>
                <div>
                  <p className="font-medium text-gray-900">
                    {label(item.rate)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {item.oldNominal
                      ? `${formatRupiah(item.oldNominal)} → `
                      : ""}
                    {formatRupiah(item.newNominal)}
                  </p>
                </div>
                <p className="text-xs text-gray-500">
                  {item.reason || "Tarif diperbarui"}
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      {open && (
        <Modal
          title="Atur Tarif Baru"
          onClose={() => !saving && setOpen(false)}
          className="max-w-[620px]"
        >
          <form onSubmit={save} className="space-y-4">
            <label className="block text-xs font-medium text-gray-700">
              Program
              <select
                required
                value={form.programId}
                onChange={(e) => {
                  const p = programs.find((x) => x.id === e.target.value);
                  setForm({
                    ...form,
                    programId: e.target.value,
                    sessionType: p?.code === "PRIVATE" ? "PRIVATE" : "REGULAR",
                  });
                }}
                className="mt-1 h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
              >
                <option value="">Pilih program</option>
                {programs
                  .filter((p) => p.isActive !== false)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-gray-700">
              Honor per Sesi
              <div className="mt-1 flex h-10 overflow-hidden rounded-md border border-gray-300">
                <span className="flex items-center border-r border-gray-200 px-3 text-sm text-gray-500">
                  Rp
                </span>
                <input
                  required
                  min="1"
                  type="number"
                  value={form.nominal}
                  onChange={(e) =>
                    setForm({ ...form, nominal: e.target.value })
                  }
                  className="min-w-0 flex-1 px-3 text-sm outline-none"
                  placeholder="Masukkan nominal honor"
                />
              </div>
            </label>
            <label className="block text-xs font-medium text-gray-700">
              Berlaku Mulai
              <input
                required
                type="date"
                value={form.effectiveFrom}
                onChange={(e) =>
                  setForm({ ...form, effectiveFrom: e.target.value })
                }
                className="mt-1 h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
              />
            </label>
            <p className="text-xs text-gray-500">
              Tarif digunakan untuk sesi yang diselesaikan sesuai periode
              berlakunya.
            </p>
            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm"
              >
                Batal
              </button>
              <button
                disabled={saving}
                className="rounded-md bg-navy-900 px-4 py-2 text-sm font-medium text-white"
              >
                {saving ? "Menyimpan..." : "Simpan Tarif"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {detail && (
        <Modal
          title="Detail Tarif Honor"
          onClose={() => setDetail(null)}
          className="max-w-[620px]"
        >
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-xs text-gray-500">Program</p>
              <p className="mt-1 font-semibold text-gray-900">
                {label(detail)}
              </p>
              <p className="text-xs text-gray-500">{model(detail)}</p>
            </div>
            <Info label="Honor / Sesi" value={formatRupiah(detail.nominal)} />
            <Info
              label="Berlaku Mulai"
              value={formatDate(detail.effectiveFrom)}
            />
            <Info
              label="Status"
              value={detail.status === "ACTIVE" ? "Aktif" : "Tidak Aktif"}
            />
            <div className="flex justify-end border-t border-gray-100 pt-4">
              <button
                onClick={() => openRate(detail)}
                className="rounded-md bg-navy-900 px-4 py-2 text-sm font-medium text-white"
              >
                Ubah Tarif
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-gray-100 pt-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 font-medium text-gray-900">{value}</p>
    </div>
  );
}
