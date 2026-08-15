"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import "./PillNav.css";

export default function PillNav({
  logo,
  logoAlt = "Logo",
  showLogo = true,
  items = [],
  activeHref,
  className = "",
  baseColor = "#1A1A1A",
  pillColor = "#F6F6F2",
  hoveredPillTextColor = "#F6F6F2",
  pillTextColor = "#1A1A1A",
  onItemClick,
  onMobileMenuChange,
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [clickedHref, setClickedHref] = useState(null);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [activeHref]);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen((open) => {
      const nextOpen = !open;
      onMobileMenuChange?.(nextOpen);
      return nextOpen;
    });
  };

  const handleItemClick = (item, event) => {
    setClickedHref(item.href);
    onItemClick?.(item, event);
    setIsMobileMenuOpen(false);
    onMobileMenuChange?.(false);
  };

  const cssVars = {
    "--pill-base": baseColor,
    "--pill-bg": pillColor,
    "--pill-hover-text": hoveredPillTextColor,
    "--pill-text": pillTextColor,
  };

  return (
    <div className={`pill-nav-container${showLogo ? "" : " pill-nav-no-logo"} ${className}`.trim()}>
      <nav className="pill-nav" style={cssVars} aria-label="Primary navigation">
        {showLogo ? (
          <Link
            href="/"
            className="pill-nav-logo"
            aria-label={logoAlt}
            onClick={(event) => handleItemClick({ href: "/", label: "Home" }, event)}
          >
            {logo}
          </Link>
        ) : null}

        <div className="pill-nav-items">
          <ul className="pill-nav-list">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`pill-nav-link${activeHref === item.href ? " is-active" : ""}${clickedHref === item.href ? " is-clicked" : ""}`}
                  aria-current={activeHref === item.href ? "page" : undefined}
                  aria-label={item.ariaLabel || item.label}
                  onClick={(event) => handleItemClick(item, event)}
                >
                  <span className="pill-nav-hover-circle" aria-hidden="true" />
                  <span className="pill-nav-label">{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          className={`pill-nav-menu-button${isMobileMenuOpen ? " is-open" : ""}`}
          onClick={toggleMobileMenu}
          aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={isMobileMenuOpen}
        >
          <span />
          <span />
        </button>
      </nav>

      <div className={`pill-nav-mobile-menu${isMobileMenuOpen ? " is-open" : ""}`} style={cssVars}>
        <ul>
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`pill-nav-mobile-link${activeHref === item.href ? " is-active" : ""}`}
                onClick={(event) => handleItemClick(item, event)}
              >
                <span>{item.label}</span>
                <span aria-hidden="true">↗</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
