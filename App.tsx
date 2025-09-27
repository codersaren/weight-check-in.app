import React, { useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Polyline, Line } from "react-native-svg";

// ---------- types & storage ----------
type Entry = { dateISO: string; weightKg: number };
type DataState = { entries: Entry[] };
const STORAGE_KEY = "weight_checkin_v1";

const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
};
const pretty = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}`;
};

// ---------- design tokens ----------
const TOKENS = {
  maxWidth: 420,
  gutter: 20,
  radiusCard: 16,
  radiusInput: 12,
  colorBg: "#FFFFFF",
  colorText: "#111111",
  colorMuted: "#6B7280",
  colorLine: "#E5E7EB",
  colorSurface: "#F8FAFC",
  colorPrimary: "#0A84FF",
  colorPrimaryPressed: "#0A7AF0",
  colorChart: "#0A84FF",
};

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState<DataState>({ entries: [] });
  const [weightInput, setWeightInput] = useState("");

  // load
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
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // persist
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
  }, [data, loaded]);

  // actions
  const saveToday = () => {
    const val = parseFloat(weightInput.replace(",", ".").trim());
    if (isNaN(val) || val <= 0 || val > 500) {
      Alert.alert("valor inválido", "ingresa tu peso en kg, por ejemplo 70.5");
      return;
    }
    const iso = todayISO();
    setData((prev) => {
      const others = prev.entries.filter((e) => e.dateISO !== iso);
      return {
        entries: [...others, { dateISO: iso, weightKg: val }]
          .sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1))
          .slice(-30),
      };
    });
    setWeightInput("");
  };

  const undoLast = () => {
    setData((prev) => {
      if (prev.entries.length === 0) return prev;
      return { entries: prev.entries.slice(0, -1) };
    });
  };

  // derived
  const last7 = useMemo(() => data.entries.slice(-7), [data.entries]);
  const hasToday = data.entries.some((e) => e.dateISO === todayISO());
  const latest = data.entries.at(-1)?.weightKg ?? null;

  // chart
  const chart = useMemo(() => {
    if (last7.length === 0) return { points: "", min: 0, max: 0, W: 0, H: 0 };
    const weights = last7.map((e) => e.weightKg);
    const min = Math.min(...weights);
    const max = Math.max(...weights);
    const pad = max - min < 0.001 ? 0.5 : Math.max(0.3, (max - min) * 0.2);
    const minY = min - pad;
    const maxY = max + pad;

    const W = Math.min(
      TOKENS.maxWidth - TOKENS.gutter * 2,
      Dimensions.get("window").width - TOKENS.gutter * 2
    );
    const H = 120;
    const stepX = W / Math.max(1, last7.length - 1);

    const scaleY = (v: number) => {
      const t = (v - minY) / (maxY - minY);
      return H - t * H;
    };

    const pts = last7
      .map((e, i) => `${i * stepX},${scaleY(e.weightKg)}`)
      .join(" ");
    return { points: pts, min: minY, max: maxY, W, H };
  }, [last7]);

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
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.container}>
              {/* header */}
              <View style={styles.header}>
                <Text style={styles.title}>check-in de peso</Text>
                <Text style={styles.subtitle}>{todayISO()}</Text>
              </View>

              {/* input card */}
              <View style={styles.card}>
                <Text style={styles.label}>tu peso de hoy (kg)</Text>
                <TextInput
                  placeholder="ej: 70.5"
                  keyboardType="decimal-pad"
                  value={weightInput}
                  onChangeText={setWeightInput}
                  style={styles.input}
                  placeholderTextColor={TOKENS.colorMuted}
                />
                <Pressable
                  onPress={saveToday}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    pressed && { backgroundColor: TOKENS.colorPrimaryPressed },
                  ]}
                >
                  <Text style={styles.primaryBtnText}>
                    {hasToday ? "actualizar" : "guardar"}
                  </Text>
                </Pressable>
                <Pressable onPress={undoLast} style={styles.linkBtn}>
                  <Text style={styles.linkText}>deshacer último</Text>
                </Pressable>
              </View>

              {/* chart */}
              <View style={styles.cardPlain}>
                <Text style={styles.sectionTitle}>últimos 7 días</Text>
                {last7.length >= 2 ? (
                  <View style={{ alignItems: "center", marginTop: 10 }}>
                    <Svg width={chart.W} height={chart.H}>
                      <Line
                        x1={0}
                        x2={chart.W}
                        y1={chart.H / 2}
                        y2={chart.H / 2}
                        stroke={TOKENS.colorLine}
                        strokeDasharray="4 6"
                        strokeWidth={1}
                      />
                      <Polyline
                        points={chart.points}
                        fill="none"
                        stroke={TOKENS.colorChart}
                        strokeWidth={3}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </Svg>
                    <View style={styles.graphLabels}>
                      {last7.map((e, i) => (
                        <Text key={e.dateISO} style={styles.graphLabelText}>
                          {i % 2 === 0 ? pretty(e.dateISO) : " "}
                        </Text>
                      ))}
                    </View>
                  </View>
                ) : (
                  <Text style={styles.helper}>
                    registra al menos 2 días para ver la tendencia
                  </Text>
                )}
              </View>

              {/* list */}
              <View style={styles.cardPlain}>
                <Text style={styles.sectionTitle}>registros</Text>
                {data.entries.length === 0 ? (
                  <Text style={styles.helper}>
                    sin datos aún. guarda tu peso de hoy.
                  </Text>
                ) : (
                  <FlatList
                    data={[...data.entries].reverse()}
                    keyExtractor={(item) => item.dateISO}
                    renderItem={({ item }) => (
                      <View style={styles.row}>
                        <Text style={styles.rowDate}>
                          {pretty(item.dateISO)}
                        </Text>
                        <Text style={styles.rowWeight}>
                          {item.weightKg.toFixed(1)} kg
                        </Text>
                      </View>
                    )}
                    ItemSeparatorComponent={() => (
                      <View style={styles.separator} />
                    )}
                    scrollEnabled={false} // dejamos que scrollee el padre
                  />
                )}
              </View>

              {/* footer */}
              <View style={{ alignItems: "center", paddingVertical: 8 }}>
                <Text style={styles.footerText}>
                  último: {latest ? `${latest.toFixed(1)} kg` : "—"}
                </Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ---------- styles ----------
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: TOKENS.colorBg },
  scrollContent: { paddingBottom: 24 },
  container: {
    width: "100%",
    maxWidth: TOKENS.maxWidth,
    alignSelf: "center",
    paddingHorizontal: TOKENS.gutter,
    paddingTop: 8,
  },
  header: { paddingTop: 4, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: "800", color: TOKENS.colorText },
  subtitle: { fontSize: 13, color: TOKENS.colorMuted, marginTop: 2 },

  // cards
  card: {
    backgroundColor: TOKENS.colorSurface,
    borderRadius: TOKENS.radiusCard,
    borderWidth: 1,
    borderColor: TOKENS.colorLine,
    padding: 16,
    marginTop: 8,
    gap: 10,
  },
  cardPlain: {
    backgroundColor: TOKENS.colorBg,
    borderRadius: TOKENS.radiusCard,
    borderWidth: 1,
    borderColor: TOKENS.colorLine,
    padding: 16,
    marginTop: 12,
  },

  label: { fontSize: 14, color: TOKENS.colorText, fontWeight: "600" },
  input: {
    backgroundColor: TOKENS.colorBg,
    borderWidth: 1,
    borderColor: TOKENS.colorLine,
    borderRadius: TOKENS.radiusInput,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: TOKENS.colorText,
  },

  primaryBtn: {
    backgroundColor: TOKENS.colorPrimary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  linkBtn: { alignItems: "center", marginTop: 2 },
  linkText: { fontSize: 13, color: TOKENS.colorMuted },

  sectionTitle: { fontSize: 16, fontWeight: "700", color: TOKENS.colorText },
  helper: { fontSize: 13, color: TOKENS.colorMuted, marginTop: 6 },

  graphLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: Math.min(
      TOKENS.maxWidth - TOKENS.gutter * 2,
      Dimensions.get("window").width - TOKENS.gutter * 2
    ),
    marginTop: 6,
  },
  graphLabelText: { fontSize: 11, color: TOKENS.colorMuted },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  rowDate: { fontSize: 15, color: TOKENS.colorText, fontWeight: "600" },
  rowWeight: { fontSize: 15, color: TOKENS.colorText },
  separator: {
    height: 1,
    backgroundColor: TOKENS.colorLine,
    marginHorizontal: 6,
  },

  footerText: { fontSize: 12, color: TOKENS.colorMuted },
});
