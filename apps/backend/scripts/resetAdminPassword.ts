import bcrypt from "bcryptjs";
import { prisma } from "../src/utils/prisma";

const SALT_ROUNDS = 10;

function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function promptHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return Promise.reject(
      new Error(
        "Terminal interaktif diperlukan untuk memasukkan password dengan aman.",
      ),
    );
  }

  return new Promise((resolve) => {
    let value = "";
    process.stdout.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const onData = (character: string) => {
      if (character === "\r" || character === "\n") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(value);
      } else if (character === "\u0003") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener("data", onData);
        process.stdout.write("\n");
        process.exitCode = 1;
        resolve("");
      } else if (character === "\u007f" || character === "\b") {
        value = value.slice(0, -1);
      } else {
        value += character;
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  const rawEmail = argumentValue("--email");
  if (!rawEmail) {
    throw new Error(
      "Gunakan: pnpm admin:reset-password --email admin@contoh.com",
    );
  }
  const email = rawEmail.trim().toLowerCase();
  const password = await promptHidden("Password baru: ");
  const confirmPassword = await promptHidden("Konfirmasi password baru: ");
  if (password.length < 8) throw new Error("Password minimal 8 karakter.");
  if (password !== confirmPassword)
    throw new Error("Konfirmasi password tidak cocok.");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.role !== "ADMIN") {
    throw new Error("Akun Admin tidak ditemukan.");
  }
  if (user.deletedAt) throw new Error("Akun Admin sudah dihapus.");

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, SALT_ROUNDS) },
  });
  console.log("Password Admin berhasil diperbarui.");
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Reset password gagal.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
