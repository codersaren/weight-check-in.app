import React, { useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Alert,
  Dimensions,
  ScrollView,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Polyline, Line, Circle } from "react-native-svg";
import * as Haptics from "expo-haptics";

// ---------- tipos y storage ----------
type Entry = { dateISO: string; weightKg: number };
type DataState = { entries: Entry[] };
const STORAGE_KEY = "weight_checkin_v2";

// ---------- utilidades de fecha ----------
const pad2 = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fromISO = (iso: string) => {
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d);
};
const todayISO = () => toISO(new Date());
const addDaysISO = (iso: string, days: number) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
};
const formatDDMMYYYY = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

// ---------- diseño (tokens) ----------
const TOK = {
  maxWidth: 420,
  gutter: 20,
  radius: 18,
  colorBg: "#FFFFFF",
  colorText: "#111111",
  colorMuted: "#6B7280",
  colorLine: "#E5E7EB",
  colorSurface: "#F8FAFC",
  colorPrimary: "#0A84FF",
  colorDarkBtn: "#1F2937",
  colorChart: "#FF7A00", // naranja
};

// ---------- helpers de datos ----------
const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

export default function App() {
  // estado base
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState<DataState>({ entries: [] });
  const [selectedDateISO, setSelectedDateISO] = useState<string>(todayISO());
  const [showChart, setShowChart] = useState(false);

  // cargar
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed: DataState = JSON.parse(raw);
          parsed.entries.sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1));
          setData(parsed);
        }
      } catch {
        // seguimos con vacío
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // persistir
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
  }, [data, loaded]);

  // derived
  const isToday = selectedDateISO === todayISO();

  const currentEntry = useMemo(
    () => data.entries.find((e) => e.dateISO === selectedDateISO),
    [data.entries, selectedDateISO]
  );

  const lastKnownWeight = useMemo(() => {
    // último peso existente (sirve de base si el día no tiene)
    const arr = data.entries;
    return arr.length ? arr[arr.length - 1].weightKg : 70;
  }, [data.entries]);

  const displayWeight = currentEntry?.weightKg ?? lastKnownWeight ?? 70;

  // acciones: navegar días
  const goPrev = () => setSelectedDateISO((d) => addDaysISO(d, -1));
  const goNext = () => {
    if (isToday) return;
    setSelectedDateISO((d) => {
      const next = addDaysISO(d, +1);
      return next > todayISO() ? todayISO() : next;
    });
  };

  // acciones: ajustar peso y guardar
  const saveWeightFor = (dateISO: string, kg: number) => {
    const val = clamp(Number(kg.toFixed(1)), 20, 300);
    setData((prev) => {
      const others = prev.entries.filter((e) => e.dateISO !== dateISO);
      return {
        entries: [...others, { dateISO, weightKg: val }]
          .sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1))
          .slice(-120), // conserva ~4 meses
      };
    });
  };

  const nudge = (delta: number) => {
    const base = currentEntry?.weightKg ?? lastKnownWeight ?? 70;
    const next = clamp(Number((base + delta).toFixed(1)), 20, 300);
    saveWeightFor(selectedDateISO, next);
    Haptics.selectionAsync();
  };

  // gráfico mejorado con scroll horizontal
  const chartData = useMemo(() => {
    const arr = [...data.entries].sort((a, b) =>
      a.dateISO < b.dateISO ? -1 : 1
    );
    return arr;
  }, [data.entries]);

  const chart = useMemo(() => {
    if (chartData.length < 1) return null;

    const screenWidth = Dimensions.get("window").width;
    const chartWidth = Math.max(
      screenWidth - TOK.gutter * 2,
      chartData.length * 60
    ); // mínimo 60px por punto
    const H = 180;
    const pointSpacing = Math.max(60, chartWidth / chartData.length); // mínimo 60px entre puntos

    const weights = chartData.map((e) => e.weightKg);
    const min = Math.min(...weights);
    const max = Math.max(...weights);
    const pad = max - min < 0.001 ? 0.6 : Math.max(0.4, (max - min) * 0.25);
    const minY = min - pad;
    const maxY = max + pad;

    const scaleY = (v: number) => {
      const t = (v - minY) / (maxY - minY);
      return H - t * H;
    };

    const points = chartData
      .map((e, i) => `${i * pointSpacing},${scaleY(e.weightKg)}`)
      .join(" ");

    return {
      W: chartWidth,
      H,
      points,
      scaleY,
      pointSpacing,
      minY,
      maxY,
      chartData,
    };
  }, [chartData]);

  if (!loaded) {
    return (
      <SafeAreaProvider>
        <SafeAreaView
          style={[
            styles.screen,
            { justifyContent: "center", alignItems: "center" },
          ]}
          edges={["top"]}
        >
          <StatusBar style="dark" />
          <Text style={styles.title}>cargando…</Text>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <StatusBar style="dark" />

        {/* header: navegación por días */}
        <View style={[styles.header, styles.rowBetween]}>
          <Pressable
            onPress={goPrev}
            style={({ pressed }) => [
              styles.navBtn,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={styles.navGlyph}>{"<"}</Text>
          </Pressable>

          <View style={{ alignItems: "center" }}>
            <Text style={styles.todayLabel}>{isToday ? "TODAY" : "DÍA"}</Text>
            <Text style={styles.dateText}>
              {formatDDMMYYYY(selectedDateISO)}
            </Text>
          </View>

          <Pressable
            onPress={goNext}
            disabled={isToday}
            style={({ pressed }) => [
              styles.navBtn,
              isToday && { opacity: 0.3 },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={styles.navGlyph}>{">"}</Text>
          </Pressable>
        </View>

        {/* contenedor principal con número centrado */}
        <View style={styles.mainContent}>
          {/* número grande centrado */}
          <View style={styles.weightBlock}>
            <Text style={styles.bigNumber}>
              {displayWeight.toFixed(1).replace(".", ",")}
            </Text>
            <Text style={styles.unit}>KG</Text>
          </View>
        </View>

        {/* spacer entre número y controles */}
        <View style={{ height: 16 }} />

        {/* controles +/- */}
        <View style={styles.controlsContainer}>
          <Pressable
            onPress={() => nudge(-0.1)}
            onLongPress={() => nudge(-0.5)}
            style={({ pressed }) => [
              styles.circleBtn,
              pressed && { transform: [{ scale: 0.98 }] },
            ]}
          >
            <Text style={styles.circleGlyph}>–</Text>
          </Pressable>

          <Pressable
            onPress={() => nudge(+0.1)}
            onLongPress={() => nudge(+0.5)}
            style={({ pressed }) => [
              styles.circleBtn,
              pressed && { transform: [{ scale: 0.98 }] },
            ]}
          >
            <Text style={styles.circleGlyph}>+</Text>
          </Pressable>
        </View>

        {/* botón para mostrar/ocultar gráfico */}
        <View style={styles.chartToggleContainer}>
          <Pressable
            onPress={() => setShowChart(!showChart)}
            style={({ pressed }) => [
              styles.chartToggleBtn,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={styles.chartToggleText}>
              {showChart ? "OCULTAR GRÁFICO" : "MOSTRAR GRÁFICO"}
            </Text>
          </Pressable>
        </View>

        {/* gráfico mejorado con scroll */}
        {showChart && (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>
              GRÁFICO COMPLETO ({chartData.length} días)
            </Text>

            {chart && chartData.length >= 1 ? (
              <View style={styles.chartContainer}>
                {/* ScrollView horizontal para el gráfico */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={true}
                  contentContainerStyle={{ paddingRight: TOK.gutter }}
                  style={styles.chartScrollView}
                >
                  <View style={{ width: chart.W }}>
                    <Svg width={chart.W} height={chart.H}>
                      {/* Grid horizontal */}
                      {[0.25, 0.5, 0.75].map((t, i) => (
                        <Line
                          key={i}
                          x1={0}
                          x2={chart.W}
                          y1={chart.H * (1 - t)}
                          y2={chart.H * (1 - t)}
                          stroke={TOK.colorLine}
                          strokeWidth={1}
                          opacity={0.5}
                        />
                      ))}

                      {/* Línea de tendencia */}
                      <Polyline
                        points={chart.points}
                        fill="none"
                        stroke={TOK.colorChart}
                        strokeWidth={3}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />

                      {/* Puntos interactivos */}
                      {chartData.map((e, i) => (
                        <Circle
                          key={e.dateISO}
                          cx={i * chart.pointSpacing}
                          cy={chart.scaleY(e.weightKg)}
                          r={6}
                          fill={TOK.colorChart}
                          stroke="#FFFFFF"
                          strokeWidth={2}
                        />
                      ))}
                    </Svg>

                    {/* Etiquetas de fechas debajo de cada punto */}
                    <View style={styles.dateLabelsContainer}>
                      {chartData.map((e, i) => (
                        <View
                          key={e.dateISO}
                          style={[
                            styles.dateLabelWrapper,
                            { left: i * chart.pointSpacing - 25 },
                          ]}
                        >
                          <Text style={styles.dateLabel}>
                            {formatDDMMYYYY(e.dateISO).slice(0, 5)}
                          </Text>
                          <Text style={styles.weightLabel}>
                            {e.weightKg.toFixed(1)}kg
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </ScrollView>

                {/* Información del rango */}
                <View style={styles.chartInfo}>
                  <Text style={styles.chartInfoText}>
                    Rango: {chart.minY.toFixed(1)}kg - {chart.maxY.toFixed(1)}kg
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={styles.helper}>
                registra días para ver la tendencia
              </Text>
            )}
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ---------- estilos ----------
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: TOK.colorBg },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  header: { paddingHorizontal: TOK.gutter, paddingTop: 6 },
  navBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: TOK.colorDarkBtn,
    alignItems: "center",
    justifyContent: "center",
  },
  navGlyph: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },

  todayLabel: {
    fontSize: 16,
    fontWeight: "800",
    color: TOK.colorText,
    letterSpacing: 1,
  },
  dateText: {
    fontSize: 16,
    fontWeight: "700",
    color: TOK.colorText,
    marginTop: 2,
  },

  mainContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  weightBlock: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  controlsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: TOK.gutter + 8,
    width: "100%",
  },
  bigNumber: {
    fontSize: 96,
    fontWeight: "900",
    color: TOK.colorText,
    lineHeight: 96,
  },
  unit: {
    fontSize: 28,
    fontWeight: "900",
    color: TOK.colorText,
    marginTop: 6,
    letterSpacing: 2,
  },

  circleBtn: {
    width: 120,
    height: 120,
    borderRadius: 999,
    backgroundColor: TOK.colorDarkBtn,
    alignItems: "center",
    justifyContent: "center",
  },
  circleGlyph: {
    color: "#FFFFFF",
    fontSize: 42,
    fontWeight: "800",
    lineHeight: 42,
  },

  chartCard: {
    marginTop: 16,
    marginHorizontal: TOK.gutter,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: TOK.colorLine,
  },
  chartTitle: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: TOK.colorText,
  },
  helper: { textAlign: "center", color: TOK.colorMuted, marginTop: 6 },
  xLabel: { fontSize: 11, color: TOK.colorMuted },
  title: { fontSize: 18, fontWeight: "600", color: TOK.colorText },

  chartToggleContainer: {
    alignItems: "center",
    marginTop: 20,
    marginHorizontal: TOK.gutter,
    marginBottom: 24,
  },
  chartToggleBtn: {
    backgroundColor: TOK.colorDarkBtn,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: TOK.radius,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  chartToggleText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 1,
  },

  // Estilos del gráfico mejorado
  chartContainer: {
    marginTop: 8,
  },
  chartScrollView: {
    maxHeight: 220,
  },
  dateLabelsContainer: {
    position: "relative",
    height: 50,
    marginTop: 8,
  },
  dateLabelWrapper: {
    position: "absolute",
    width: 50,
    alignItems: "center",
  },
  dateLabel: {
    fontSize: 10,
    color: TOK.colorMuted,
    fontWeight: "600",
  },
  weightLabel: {
    fontSize: 9,
    color: TOK.colorText,
    fontWeight: "700",
    marginTop: 2,
  },
  chartInfo: {
    alignItems: "center",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: TOK.colorLine,
  },
  chartInfoText: {
    fontSize: 12,
    color: TOK.colorMuted,
    fontWeight: "600",
  },
});
