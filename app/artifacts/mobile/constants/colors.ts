/**
 * Semantic design tokens mirroring the web artifact's index.css naming so every
 * artifact shares one visual identity (convert its HSL values to hex). To add
 * dark mode, add a `dark` key with the same token names; useColors() picks it up.
 */

const colors = {
  light: {
    text: '#19322B',
    tint: '#176B55',

    background: '#F7F4EC',
    foreground: '#19322B',

    card: '#FFFDF8',
    cardForeground: '#19322B',

    primary: '#176B55',
    primaryForeground: '#ffffff',
    primarySoft: '#A9C9B9',

    secondary: '#E9F0E8',
    secondaryForeground: '#19322B',

    muted: '#E7E5DD',
    mutedForeground: '#718078',

    accent: '#F1E9D1',
    accentForeground: '#19322B',

    destructive: '#B74C43',
    destructiveForeground: '#ffffff',

    border: '#E2DED2',
    input: '#D8D4C8',
  },

  dark: {
    text: '#F3EFE5',
    tint: '#86C8A7',
    background: '#10241F',
    foreground: '#F3EFE5',
    card: '#17332B',
    cardForeground: '#F3EFE5',
    primary: '#70B997',
    primaryForeground: '#0E201B',
    primarySoft: '#B1D5BE',
    secondary: '#203D34',
    secondaryForeground: '#F3EFE5',
    muted: '#2B443C',
    mutedForeground: '#A9B9B0',
    accent: '#3D3929',
    accentForeground: '#F3EFE5',
    destructive: '#D2746A',
    destructiveForeground: '#24120F',
    border: '#2D493F',
    input: '#355247',
  },

  radius: 18,
};

export default colors;
