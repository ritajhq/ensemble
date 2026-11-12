'use client';

import type { ReactNode } from 'react';
import { DirectionProvider } from '@radix-ui/react-direction';
import { ThemeProvider, type ThemeProviderProps } from 'next-themes';
import { I18nProvider, type I18nProviderProps } from '../contexts/i18n.tsx';
import { SearchProvider, type SearchProviderProps } from '../contexts/search.tsx';

interface SearchOptions extends Omit<SearchProviderProps, 'children'> {
  /**
   * Enable search functionality
   *
   * @defaultValue `true`
   */
  enabled?: boolean;
}

interface ThemeOptions extends ThemeProviderProps {
  /**
   * Enable `next-themes`
   *
   * @defaultValue true
   */
  enabled?: boolean;
}

export interface RootProviderProps {
  /**
   * `dir` option for Radix UI
   */
  dir?: 'rtl' | 'ltr';

  /**
   * @remarks `SearchProviderProps`
   */
  search?: Partial<SearchOptions>;

  /**
   * Customize options for `next-themes`
   */
  theme?: ThemeOptions;

  i18n?: Omit<I18nProviderProps, 'children'>;

  children?: ReactNode;
}

export function RootProvider({
  children,
  dir = 'ltr',
  theme = {},
  search,
  i18n,
}: RootProviderProps) {
  let body = children;

  // Vendored: no default dialog ships, so search mounts only once one is given.
  if (search?.SearchDialog && search.enabled !== false) {
    body = <SearchProvider {...(search as SearchProviderProps)}>{body}</SearchProvider>;
  }

  if (theme?.enabled !== false) {
    body = (
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
        {...theme}
      >
        {body}
      </ThemeProvider>
    );
  }

  if (i18n) {
    body = <I18nProvider {...i18n}>{body}</I18nProvider>;
  }

  return <DirectionProvider dir={dir}>{body}</DirectionProvider>;
}

export {
  /**
   * re-exported from `next-themes`
   */
  useTheme,
  type UseThemeProps,
} from 'next-themes';
