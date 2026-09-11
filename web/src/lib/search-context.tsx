"use client";

import { createContext, useContext, useState } from "react";

interface SearchCtx {
  query: string;
  setQuery: (v: string) => void;
}

const Ctx = createContext<SearchCtx>({ query: "", setQuery: () => {} });

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = useState("");
  return <Ctx.Provider value={{ query, setQuery }}>{children}</Ctx.Provider>;
}

export const useSearch = () => useContext(Ctx);
