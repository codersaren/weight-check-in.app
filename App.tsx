// Importaciones de React y React Native
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
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Polyline, Line } from "react-native-svg";

// ===== DEFINICIÓN DE TIPOS =====
// Tipo que representa una entrada de peso con fecha y peso en kilogramos
type Entry = { dateISO: string; weightKg: number };
// Tipo que representa el estado completo de datos con un array de entradas
type DataState = { entries: Entry[] };

// ===== CONFIGURACIÓN DE ALMACENAMIENTO =====
// Clave única para guardar los datos en AsyncStorage (almacenamiento local del dispositivo)
const STORAGE_KEY = "weight_checkin_v1";

// ===== FUNCIONES UTILITARIAS =====
// Función que obtiene la fecha de hoy en formato ISO (YYYY-MM-DD)
// Útil para comparar fechas y mantener consistencia en el formato
const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0"); // Mes con cero inicial si es necesario
  const da = String(d.getDate()).padStart(2, "0"); // Día con cero inicial si es necesario
  return `${y}-${m}-${da}`;
};

// Función que convierte una fecha ISO (YYYY-MM-DD) a formato más legible (DD/MM)
// Se usa para mostrar las fechas de manera más amigable al usuario
const pretty = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}`;
};

// ===== COMPONENTE PRINCIPAL =====
export default function App() {
  // ===== ESTADOS DEL COMPONENTE =====
  // Estado que indica si la aplicación ya cargó los datos del almacenamiento local
  const [loaded, setLoaded] = useState(false);
  // Estado que contiene todos los registros de peso del usuario
  const [data, setData] = useState<DataState>({ entries: [] });
  // Estado que maneja el texto que el usuario escribe en el campo de entrada
  const [weightInput, setWeightInput] = useState("");

  // ===== EFECTOS DE CARGA Y GUARDADO =====
  // Efecto que se ejecuta una sola vez al cargar la aplicación
  // Su propósito es recuperar los datos guardados previamente del almacenamiento local
  useEffect(() => {
    (async () => {
      try {
        // Intentamos leer los datos guardados usando la clave de almacenamiento
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          // Si hay datos, los convertimos de JSON a objeto JavaScript
          const parsed: DataState = JSON.parse(raw);
          // Ordenamos las entradas por fecha ascendente para mantener consistencia
          parsed.entries.sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1));
          // Actualizamos el estado con los datos recuperados
          setData(parsed);
        }
      } catch (_) {
        // Si hay algún error al leer los datos, continuamos con estado vacío
        // Esto evita que la aplicación se rompa si hay datos corruptos
      } finally {
        // Independientemente del resultado, marcamos la aplicación como cargada
        setLoaded(true);
      }
    })();
  }, []);

  // Efecto que se ejecuta cada vez que cambian los datos
  // Su propósito es guardar automáticamente los datos en el almacenamiento local
  useEffect(() => {
    // Solo guardamos si la aplicación ya terminó de cargar inicialmente
    if (!loaded) return;
    // Convertimos los datos a JSON y los guardamos en AsyncStorage
    // Si hay error, lo ignoramos silenciosamente para no interrumpir la experiencia
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
  }, [data, loaded]);

  // ===== FUNCIONES DE MANEJO DE DATOS =====
  // Función que guarda el peso ingresado para el día actual
  const saveToday = () => {
    // Convertimos el texto ingresado a número, reemplazando comas por puntos
    // y eliminando espacios en blanco para manejar diferentes formatos de entrada
    const val = parseFloat(weightInput.replace(",", ".").trim());

    // Validamos que el valor sea un número válido y esté en un rango razonable
    if (isNaN(val) || val <= 0 || val > 500) {
      Alert.alert("Valor Inválido", "Ingresa Tu Peso En Kg, Por Ejemplo 70.5");
      return;
    }

    // Obtenemos la fecha de hoy en formato ISO
    const iso = todayISO();

    // Actualizamos el estado de datos
    setData((prev) => {
      // Si ya existe un registro para hoy, lo eliminamos primero
      const others = prev.entries.filter((e) => e.dateISO !== iso);
      const next: DataState = {
        // Agregamos el nuevo registro y mantenemos solo los últimos 30 días
        entries: [...others, { dateISO: iso, weightKg: val }]
          .sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1))
          .slice(-30), // Conservamos solo los últimos 30 registros para optimizar memoria
      };
      return next;
    });

    // Limpiamos el campo de entrada después de guardar
    setWeightInput("");
  };

  // Función que elimina el último registro ingresado (función "deshacer")
  const undoLast = () => {
    setData((prev) => {
      // Si no hay registros, no hacemos nada
      if (prev.entries.length === 0) return prev;
      // Eliminamos el último elemento del array usando slice
      const next = { entries: prev.entries.slice(0, -1) };
      return next;
    });
  };

  // ===== DATOS COMPUTADOS PARA LA INTERFAZ =====
  // Obtenemos los últimos 7 registros para mostrar en el gráfico
  // useMemo optimiza el rendimiento recalculando solo cuando cambian los datos
  const last7 = useMemo(() => data.entries.slice(-7), [data.entries]);

  // Verificamos si ya existe un registro para el día de hoy
  // Esto determina si el botón dice "guardar" o "actualizar"
  const hasToday = data.entries.some((e) => e.dateISO === todayISO());

  // Obtenemos el peso del último registro para mostrar en el resumen
  const latest = data.entries.at(-1)?.weightKg ?? null;

  // ===== CÁLCULO DE DATOS PARA EL GRÁFICO =====
  // Calculamos los datos necesarios para dibujar el gráfico de tendencia
  const chart = useMemo(() => {
    // Si no hay datos suficientes, retornamos valores por defecto
    if (last7.length === 0)
      return { points: "", min: 0, max: 0, W: 300, H: 120 };

    // Extraemos solo los valores de peso de los últimos 7 registros
    const weights = last7.map((e) => e.weightKg);
    const min = Math.min(...weights); // Peso mínimo
    const max = Math.max(...weights); // Peso máximo

    // Calculamos un margen (padding) para que el gráfico no se vea muy plano
    // Si la diferencia es muy pequeña, usamos un margen fijo de 0.5kg
    const pad = max - min < 0.001 ? 0.5 : Math.max(0.3, (max - min) * 0.2);
    const minY = min - pad; // Valor mínimo en el eje Y del gráfico
    const maxY = max + pad; // Valor máximo en el eje Y del gráfico

    // Dimensiones del gráfico SVG
    const W = 300; // Ancho del gráfico en píxeles
    const H = 120; // Alto del gráfico en píxeles
    const stepX = W / Math.max(1, last7.length - 1); // Espaciado horizontal entre puntos

    // Función que convierte un valor de peso a coordenada Y en el gráfico
    const scaleY = (v: number) => {
      // Calculamos la posición relativa del valor entre minY y maxY
      const t = (v - minY) / (maxY - minY);
      // Invertimos Y porque en SVG el (0,0) está arriba, pero queremos que los valores
      // más altos aparezcan más arriba visualmente
      return H - t * H;
    };

    // Generamos los puntos del gráfico como string para el componente Polyline
    const pts = last7
      .map((e, i) => `${i * stepX},${scaleY(e.weightKg)}`)
      .join(" ");

    return { points: pts, min: minY, max: maxY, W, H };
  }, [last7]);

  // ===== PANTALLA DE CARGA =====
  // Si la aplicación aún no ha terminado de cargar los datos, mostramos una pantalla de carga
  if (!loaded) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={[styles.container, { justifyContent: "center" }]}>
          <Text style={styles.title}>Cargando…</Text>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // ===== INTERFAZ PRINCIPAL =====
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          {/* ===== CABECERA DE LA APLICACIÓN ===== */}
          <View style={styles.header}>
            <Text style={styles.title}>Check-In De Peso</Text>
            <Text style={styles.subtitle}>{todayISO()}</Text>
          </View>

          {/* ===== SECCIÓN DE ENTRADA DE DATOS ===== */}
          <View style={styles.card}>
            <Text style={styles.label}>Tu Peso De Hoy (kg)</Text>
            <TextInput
              placeholder="Ej: 70.5"
              keyboardType="decimal-pad"
              value={weightInput}
              onChangeText={setWeightInput}
              style={styles.input}
              placeholderTextColor="#9CA3AF"
            />
            <Pressable
              onPress={saveToday}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text style={styles.primaryBtnText}>
                {hasToday ? "Actualizar" : "Guardar"}
              </Text>
            </Pressable>
            <Pressable onPress={undoLast} style={styles.linkBtn}>
              <Text style={styles.linkText}>Deshacer Último</Text>
            </Pressable>
          </View>

          {/* ===== SECCIÓN DEL GRÁFICO DE TENDENCIA ===== */}
          <View style={styles.graphCard}>
            <Text style={styles.sectionTitle}>Últimos 7 Días</Text>
            {last7.length >= 2 ? (
              <View style={{ alignItems: "center", marginTop: 8 }}>
                <Svg width={chart.W} height={chart.H}>
                  {/* Línea de referencia horizontal en el centro del gráfico */}
                  <Line
                    x1={0}
                    x2={chart.W}
                    y1={chart.H / 2}
                    y2={chart.H / 2}
                    stroke="#E5E7EB"
                    strokeDasharray="4 6"
                    strokeWidth={1}
                  />
                  {/* Línea de tendencia que conecta todos los puntos de peso */}
                  <Polyline
                    points={chart.points}
                    fill="none"
                    stroke="#0A84FF"
                    strokeWidth={3}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </Svg>
                {/* Etiquetas de fechas debajo del gráfico */}
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
                Registra Al Menos 2 Días Para Ver La Tendencia
              </Text>
            )}
          </View>

          {/* ===== SECCIÓN DE LISTA DE REGISTROS ===== */}
          <View style={styles.listCard}>
            <Text style={styles.sectionTitle}>Registros</Text>
            {data.entries.length === 0 ? (
              <Text style={styles.helper}>
                Sin Datos Aún. Guarda Tu Peso De Hoy.
              </Text>
            ) : (
              <FlatList
                data={[...data.entries].reverse()} // Mostramos los registros más recientes primero
                keyExtractor={(item) => item.dateISO}
                renderItem={({ item }) => (
                  <View style={styles.row}>
                    <Text style={styles.rowDate}>{pretty(item.dateISO)}</Text>
                    <Text style={styles.rowWeight}>
                      {item.weightKg.toFixed(1)} kg
                    </Text>
                  </View>
                )}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
              />
            )}
          </View>

          {/* ===== RESUMEN EN EL PIE DE PÁGINA ===== */}
          <View style={{ paddingBottom: 12, alignItems: "center" }}>
            <Text style={styles.footerText}>
              Último: {latest ? `${latest.toFixed(1)} kg` : "—"}
            </Text>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ===== ESTILOS DE LA APLICACIÓN =====
const styles = StyleSheet.create({
  // Contenedor principal con fondo blanco
  container: { flex: 1, backgroundColor: "#FFFFFF" },

  // Estilos para la cabecera
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 22, fontWeight: "700", color: "#111111" },
  subtitle: { fontSize: 13, color: "#6B7280", marginTop: 2 },

  // Estilos para la tarjeta de entrada de datos
  card: {
    marginTop: 8,
    marginHorizontal: 20,
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
    gap: 10,
  },
  label: { fontSize: 14, color: "#111111", fontWeight: "600" },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111111",
  },

  // Estilos para botones
  primaryBtn: {
    backgroundColor: "#0A84FF",
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
  linkText: { fontSize: 13, color: "#6B7280" },

  // Estilos para la tarjeta del gráfico
  graphCard: {
    marginTop: 12,
    marginHorizontal: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#111111" },
  helper: { fontSize: 13, color: "#6B7280", marginTop: 6 },

  // Estilos para las etiquetas del gráfico
  graphLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 300,
    marginTop: 6,
  },
  graphLabelText: { fontSize: 11, color: "#6B7280" },

  // Estilos para la tarjeta de lista de registros
  listCard: {
    marginTop: 12,
    marginHorizontal: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 8,
    maxHeight: 220, // Altura máxima para evitar que la lista ocupe toda la pantalla
  },

  // Estilos para las filas de la lista
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  rowDate: { fontSize: 15, color: "#111111", fontWeight: "600" },
  rowWeight: { fontSize: 15, color: "#111111" },
  separator: { height: 1, backgroundColor: "#E5E7EB", marginHorizontal: 8 },

  // Estilos para el texto del pie de página
  footerText: { fontSize: 12, color: "#6B7280" },
});
