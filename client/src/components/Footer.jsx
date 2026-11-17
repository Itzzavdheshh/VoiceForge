import React from "react";
import {
  Phone,
  Mail,
  MessageCircle,
  ExternalLink,
  Globe,
  Shield,
  Heart,
} from "lucide-react";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-ink/10 bg-white/80 backdrop-blur-md dark:border-border dark:bg-black/90 text-ink dark:text-neutral-200 transition-colors">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-12 items-center">
          {/* Creator & Brand info */}
          <div className="md:col-span-5 flex items-center gap-4">
            <div className="relative group shrink-0">
              <img
                src="/owner.jpg"
                alt="Avdhesh Kumar Dadhich"
                className="h-14 w-14 rounded-full object-cover ring-2 ring-moss/30 dark:ring-glow/40 shadow-md group-hover:scale-105 transition-transform duration-200"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = "https://github.com/itzzavdheshh.png";
                }}
              />
              <span
                className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-black"
                title="Online / Available"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-ink dark:text-neutral-100">
                  VoiceForge
                </h3>
                <span className="rounded-full bg-moss/10 px-2 py-0.5 text-[10px] font-semibold text-moss dark:bg-glow/20 dark:text-glow">
                  MIT License
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Created with{" "}
                <Heart
                  size={11}
                  className="inline text-rose-500 fill-rose-500 mx-0.5"
                />{" "}
                by{" "}
                <a
                  href="https://github.com/itzzavdheshh"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-ink dark:text-neutral-200 hover:text-moss dark:hover:text-glow underline underline-offset-2 transition-colors"
                >
                  Avdhesh Kumar Dadhich
                </a>
              </p>
              <a
                href="https://voice-forge-client.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 mt-1"
              >
                <Globe size={11} />
                <span>voice-forge-client.vercel.app</span>
                <ExternalLink size={10} />
              </a>
            </div>
          </div>

          {/* Quick Direct Contact Buttons */}
          <div className="md:col-span-4 flex flex-wrap items-center justify-start md:justify-center gap-2">
            <a
              href="https://wa.me/917690863039?text=Hi%20Avdhesh%2C%20I%20came%20from%20VoiceForge!"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400 transition-colors"
              title="Chat on WhatsApp"
            >
              <MessageCircle size={13} />
              <span>WhatsApp</span>
            </a>

            <a
              href="tel:+917690863039"
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400 transition-colors"
              title="Call Direct: +91 7690863039"
            >
              <Phone size={13} />
              <span>Call</span>
            </a>

            <a
              href="mailto:aavdhesh.dadhich@gmail.com"
              className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/10 px-3 py-1.5 text-xs font-semibold text-purple-600 hover:bg-purple-500/20 dark:bg-purple-500/20 dark:text-purple-400 transition-colors"
              title="Send Direct Email"
            >
              <Mail size={13} />
              <span>Email</span>
            </a>
          </div>

          {/* Social Links Icons */}
          <div className="md:col-span-3 flex items-center justify-start md:justify-end gap-3 text-neutral-600 dark:text-neutral-400">
            {/* GitHub */}
            <a
              href="https://github.com/itzzavdheshh"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              title="GitHub Profile"
              className="p-1.5 rounded-lg hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white transition-colors"
            >
              <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </a>

            {/* LinkedIn */}
            <a
              href="https://www.linkedin.com/in/aavdhesh"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
              title="LinkedIn Profile"
              className="p-1.5 rounded-lg hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white transition-colors"
            >
              <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
              </svg>
            </a>

            {/* X / Twitter */}
            <a
              href="https://x.com/Itzzavdheshh"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X (Twitter)"
              title="X Profile"
              className="p-1.5 rounded-lg hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white transition-colors"
            >
              <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>

            {/* Instagram */}
            <a
              href="https://www.instagram.com/itzzavdheshh?igsi=MTFkNTM5OGljOHV5aQ=="
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              title="Instagram Profile"
              className="p-1.5 rounded-lg hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white transition-colors"
            >
              <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
            </a>

            {/* Discord */}
            <a
              href="https://discord.com/users/1385290408698839223"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Discord"
              title="Discord Profile"
              className="p-1.5 rounded-lg hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white transition-colors"
            >
              <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
            </a>
          </div>
        </div>

        {/* Bottom Rights Line */}
        <div className="mt-6 border-t border-ink/5 pt-4 dark:border-white/5 flex flex-col sm:flex-row items-center justify-between text-[11px] text-neutral-400 gap-2">
          <p>
            © {currentYear} VoiceForge. All rights reserved. Open source under
            MIT License.
          </p>
          <div className="flex items-center gap-4">
            <span>
              Author:{" "}
              <strong className="text-neutral-600 dark:text-neutral-300">
                Avdhesh Kumar Dadhich
              </strong>
            </span>
            <span>
              Tel:{" "}
              <a
                href="tel:+917690863039"
                className="hover:underline text-neutral-600 dark:text-neutral-300"
              >
                +91 7690863039
              </a>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
