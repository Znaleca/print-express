import Image from "next/image";

export default function ProfileAvatar({
  src,
  name = "User",
  className = "h-10 w-10",
  fallbackClassName = "bg-slate-900 text-white",
  sizes = "40px",
}) {
  const initial = String(name || "User").trim().charAt(0).toUpperCase() || "U";

  return (
    <span
      className={`relative inline-flex shrink-0 overflow-hidden rounded-full border border-slate-200 ${className} ${src ? "bg-slate-100" : fallbackClassName}`}
      aria-label={`${name || "User"} profile photo`}
    >
      {src ? (
        <Image
          src={src}
          alt={`${name || "User"} profile photo`}
          fill
          sizes={sizes}
          className="object-cover"
          unoptimized={String(src).startsWith("blob:")}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-sm font-extrabold" aria-hidden="true">
          {initial}
        </span>
      )}
    </span>
  );
}
