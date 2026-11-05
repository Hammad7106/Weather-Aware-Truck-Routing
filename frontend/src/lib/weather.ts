import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
  type LucideIcon,
} from 'lucide-react'

interface WeatherKind {
  label: string
  icon: LucideIcon
}

/** WMO weather interpretation codes, as returned by Open-Meteo. */
export function describeWeatherCode(code: number | null): WeatherKind {
  if (code === null) return { label: 'Unknown', icon: Cloud }
  if (code === 0) return { label: 'Clear', icon: Sun }
  if (code <= 2) return { label: 'Partly cloudy', icon: CloudSun }
  if (code === 3) return { label: 'Overcast', icon: Cloud }
  if (code === 45 || code === 48) return { label: 'Fog', icon: CloudFog }
  if (code >= 51 && code <= 57) return { label: 'Drizzle', icon: CloudDrizzle }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82))
    return { label: code === 66 || code === 67 ? 'Freezing rain' : 'Rain', icon: CloudRain }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return { label: 'Snow', icon: CloudSnow }
  if (code >= 95) return { label: 'Thunderstorm', icon: CloudLightning }
  return { label: 'Cloudy', icon: Cloud }
}
