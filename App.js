import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, SafeAreaView, Keyboard, ScrollView, Modal, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const API_KEY = '8781e84bef6d6f9563c506e1'; 

const LOCATION_DATA = {
  "🇻🇳 Vietnam": ["Hanoi", "Ho Chi Minh City", "Da Nang", "Phu Quoc", "Hoi An", "Sapa", "Nha Trang"],
  "🇮🇳 India": ["Mumbai", "Delhi", "Goa", "Bangalore", "Jaipur", "Hyderabad", "Kochi", "Chennai"],
  "🇹🇭 Thailand": ["Bangkok", "Phuket", "Chiang Mai", "Pattaya", "Krabi", "Koh Samui"],
  "🇯🇵 Japan": ["Tokyo", "Osaka", "Kyoto", "Sapporo"],
  "🇺🇸 USA": ["New York", "Los Angeles", "Chicago", "Las Vegas", "Miami"]
};

const CURRENCIES = [
  { label: "🇮🇳 INR (₹)", value: "INR", symbol: "₹" },
  { label: "🇺🇸 USD ($)", value: "USD", symbol: "$" },
  { label: "🇻🇳 VND (₫)", value: "VND", symbol: "₫" },
  { label: "🇪🇺 EUR (€)", value: "EUR", symbol: "€" },
  { label: "🇬🇧 GBP (£)", value: "GBP", symbol: "£" }
];

const CATEGORIES = ["🍔 Food", "🏨 Hotel", "🚕 Transport", "🛍️ Shopping", "🎟️ Other"];
const PAYMENTS = ["Cash 💵", "Credit Card 💳", "Debit Card 💳", "UPI 📲"];

export default function App() {
  const [trips, setTrips] = useState({});
  const [activeTrip, setActiveTrip] = useState('My First Trip');
  const [masterCurrency, setMasterCurrency] = useState('INR');
  const [rates, setRates] = useState({});
  
  // Trip Modal States
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' or 'rename'
  const [newTripName, setNewTripName] = useState('');

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [amount1, setAmount1] = useState('');
  const [currency1, setCurrency1] = useState('VND');
  const [paymentMethod, setPaymentMethod] = useState('Cash 💵');
  const [category, setCategory] = useState('🍔 Food');
  const [country, setCountry] = useState("🇻🇳 Vietnam");
  const [city, setCity] = useState("Hanoi");

  const loadAllData = useCallback(async () => {
    const data = await AsyncStorage.getItem('@nexus_v5_master');
    if (data) {
      const parsed = JSON.parse(data);
      setTrips(parsed.trips || {});
      setActiveTrip(parsed.activeTrip || 'My First Trip');
      setMasterCurrency(parsed.masterCurrency || 'INR');
    }
  }, []);

  const fetchRates = useCallback(async () => {
    try {
      const res = await fetch(`https://v6.exchangerate-api.com/v6/${API_KEY}/latest/${masterCurrency}`);
      const data = await res.json();
      if (data.conversion_rates) setRates(data.conversion_rates);
    } catch (e) { console.log("Rate fetch failed"); }
  }, [masterCurrency]);

  useEffect(() => { loadAllData(); }, [loadAllData]);
  useEffect(() => { fetchRates(); }, [fetchRates]);

  const saveData = async (t, a, m) => {
    await AsyncStorage.setItem('@nexus_v5_master', JSON.stringify({ trips: t, activeTrip: a, masterCurrency: m }));
  };

  const currentExpenses = useMemo(() => trips[activeTrip] || [], [trips, activeTrip]);
  
  const getConvertedAmount = useCallback((amount, fromCurrency) => {
    if (fromCurrency === masterCurrency) return amount;
    const rate = rates[fromCurrency];
    return rate ? amount / rate : amount;
  }, [rates, masterCurrency]);

  const formatValue = (n) => parseFloat(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const getSymbol = (code) => CURRENCIES.find(c => c.value === code)?.symbol || "";

  // TRIP MANAGEMENT (MODAL BASED)
  const openTripModal = (mode) => {
    setModalMode(mode);
    setNewTripName(mode === 'rename' ? activeTrip : '');
    setModalVisible(true);
  };

  const handleTripSubmit = () => {
    if (!newTripName) return;
    const updatedTrips = { ...trips };
    if (modalMode === 'add') {
      updatedTrips[newTripName] = [];
      setActiveTrip(newTripName);
    } else {
      updatedTrips[newTripName] = updatedTrips[activeTrip];
      delete updatedTrips[activeTrip];
      setActiveTrip(newTripName);
    }
    setTrips(updatedTrips);
    saveData(updatedTrips, newTripName, masterCurrency);
    setModalVisible(false);
  };

  const handleAddExpense = async () => {
    if (!amount1 || !description) return Alert.alert('Error', 'Fill all fields');
    const newExp = { 
      id: Date.now().toString(), date, description, country, city, category,
      amount_1: parseFloat(amount1), currency_1: currency1, method: paymentMethod 
    };
    const updatedTrips = { ...trips, [activeTrip]: [newExp, ...currentExpenses] };
    setTrips(updatedTrips); saveData(updatedTrips, activeTrip, masterCurrency);
    setAmount1(''); setDescription(''); Keyboard.dismiss();
  };

  const deleteExpense = (id) => {
    const updated = currentExpenses.filter(e => e.id !== id);
    const updatedTrips = { ...trips, [activeTrip]: updated };
    setTrips(updatedTrips); saveData(updatedTrips, activeTrip, masterCurrency);
  };

  const moveExpense = (index, direction) => {
    const newPos = index + direction;
    if (newPos < 0 || newPos >= currentExpenses.length) return;
    const updated = [...currentExpenses];
    const item = updated[index];
    updated.splice(index, 1);
    updated.splice(newPos, 0, item);
    const updatedTrips = { ...trips, [activeTrip]: updated };
    setTrips(updatedTrips); saveData(updatedTrips, activeTrip, masterCurrency);
  };

  const totals = useMemo(() => {
    const cash = currentExpenses.filter(e => e.method === 'Cash 💵').reduce((s, e) => s + getConvertedAmount(e.amount_1, e.currency_1), 0);
    const nonCash = currentExpenses.filter(e => e.method !== 'Cash 💵').reduce((s, e) => s + getConvertedAmount(e.amount_1, e.currency_1), 0);
    return { cash, nonCash, grand: cash + nonCash };
  }, [currentExpenses, getConvertedAmount]);

  const sharePDF = async () => {
    const symbol = getSymbol(masterCurrency);
    const html = `<html><body><h1 style="text-align:center;">${activeTrip} Report</h1><p style="text-align:center;">Total: ${symbol}${formatValue(totals.grand)}</p><table style="width:100%; border-collapse:collapse; text-align:center;"><thead><tr style="background:#f1f5f9;"><th>Date</th><th>Location</th><th>Desc</th><th>Method</th><th>Total (${masterCurrency})</th></tr></thead><tbody>${currentExpenses.map(e => `<tr><td>${e.date}</td><td>${e.city}</td><td>${e.description}</td><td>${e.method}</td><td>${symbol}${formatValue(getConvertedAmount(e.amount_1, e.currency_1))}</td></tr>`).join('')}</tbody></table></body></html>`;
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{modalMode === 'add' ? 'New Trip' : 'Rename Trip'}</Text>
          <TextInput style={styles.modalInput} value={newTripName} onChangeText={setNewTripName} placeholder="Trip Name..." />
          <View style={styles.row}>
            <TouchableOpacity style={[styles.modalBtn, {backgroundColor: '#ccc'}]} onPress={() => setModalVisible(false)}><Text>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalBtn} onPress={handleTripSubmit}><Text style={{color:'white'}}>Save</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      <ScrollView stickyHeaderIndices={[0]}>
        <View style={styles.header}>
          <Text style={styles.appTitle}>EXPENSE TRACKER</Text>
          <Text style={styles.authorTag}>Made by Shitanshu Chokshi</Text>
          <View style={[styles.row, {marginTop: 15}]}>
            <View style={styles.tripPicker}>
              <Picker selectedValue={activeTrip} onValueChange={(t) => { setActiveTrip(t); saveData(trips, t, masterCurrency); }}>
                {Object.keys(trips).length > 0 ? Object.keys(trips).map(t => <Picker.Item key={t} label={t} value={t} />) : <Picker.Item label="My First Trip" value="My First Trip" />}
              </Picker>
            </View>
            <TouchableOpacity style={styles.iconBtn} onPress={() => openTripModal('rename')}><Text>✏️</Text></TouchableOpacity>
            <TouchableOpacity style={styles.plusBtn} onPress={() => openTripModal('add')}><Text style={styles.plusText}>+</Text></TouchableOpacity>
          </View>
          <View style={styles.homeCurrencyRow}>
            <Text style={styles.subText}>Home Currency: </Text>
            <View style={styles.currencyPickerWrapper}><Picker selectedValue={masterCurrency} onValueChange={(m) => { setMasterCurrency(m); saveData(trips, activeTrip, m); }}>{CURRENCIES.map(c => <Picker.Item key={c.value} label={c.label} value={c.value} />)}</Picker></View>
          </View>
        </View>

        <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>TOTALS ({masterCurrency})</Text>
            <View style={styles.rowBetween}>
                <Text style={styles.legendText}>🟢 Cash: {getSymbol(masterCurrency)}{formatValue(totals.cash)}</Text>
                <Text style={styles.legendText}>🔵 Non-Cash: {getSymbol(masterCurrency)}{formatValue(totals.nonCash)}</Text>
            </View>
        </View>

        <View style={styles.inputCard}>
          <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" value={date} onChangeText={setDate} />
          <View style={styles.row}>
            <View style={styles.halfPicker}><Picker selectedValue={country} onValueChange={(v) => { setCountry(v); setCity(LOCATION_DATA[v][0]); }}>{Object.keys(LOCATION_DATA).map(k => <Picker.Item key={k} label={k} value={k} />)}</Picker></View>
            <View style={styles.halfPicker}><Picker selectedValue={city} onValueChange={setCity}>{LOCATION_DATA[country]?.map(c => <Picker.Item key={c} label={c} value={c} />)}</Picker></View>
          </View>
          <TextInput style={styles.input} placeholder="Description" placeholderTextColor="#94a3b8" value={description} onChangeText={setDescription} />
          <View style={styles.row}>
            <View style={styles.halfPicker}><Picker selectedValue={category} onValueChange={setCategory}>{CATEGORIES.map(c => <Picker.Item key={c} label={c} value={c} />)}</Picker></View>
            <TextInput style={[styles.input, {flex: 1.2, marginBottom: 0}]} placeholder="Amount" placeholderTextColor="#94a3b8" keyboardType="numeric" value={amount1} onChangeText={setAmount1} />
          </View>
          <View style={styles.row}>
            <View style={styles.halfPicker}><Picker selectedValue={currency1} onValueChange={setCurrency1}>{CURRENCIES.map(c => <Picker.Item key={c.value} label={c.label} value={c.value} />)}</Picker></View>
            <View style={styles.halfPicker}><Picker selectedValue={paymentMethod} onValueChange={setPaymentMethod}>{PAYMENTS.map(p => <Picker.Item key={p} label={p} value={p} />)}</Picker></View>
          </View>
          <TouchableOpacity style={styles.submitBtn} onPress={handleAddExpense}><Text style={styles.btnText}>+ ADD EXPENSE</Text></TouchableOpacity>
        </View>

        {currentExpenses.map((item, index) => {
          const converted = getConvertedAmount(item.amount_1, item.currency_1);
          const rateToDisplay = rates[item.currency_1] ? (1 / rates[item.currency_1]).toFixed(6) : "1.0000";
          return (
            <View key={item.id} style={styles.card}>
              <View style={styles.sortCol}>
                <TouchableOpacity onPress={() => moveExpense(index, -1)} disabled={index === 0}><Text style={{color: index === 0 ? '#ccc' : '#3b82f6'}}>▲</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => moveExpense(index, 1)} disabled={index === currentExpenses.length-1}><Text style={{color: index === currentExpenses.length-1 ? '#ccc' : '#3b82f6'}}>▼</Text></TouchableOpacity>
              </View>
              <View style={{flex: 1}}>
                <Text style={styles.cardDate}>{item.date} • {item.city} ({item.category})</Text>
                <Text style={styles.cardDesc}>{item.description}</Text>
                <Text style={styles.rateText}>1 {item.currency_1} = {rateToDisplay} {masterCurrency}</Text>
                <Text style={styles.cardSmall}>Spent: {formatValue(item.amount_1)} {item.currency_1}</Text>
              </View>
              <View style={{alignItems: 'flex-end'}}>
                <Text style={styles.cardAmt}>{getSymbol(masterCurrency)}{formatValue(converted)}</Text>
                <Text style={styles.methodText}>{item.method.split(' ')[0]}</Text>
                <TouchableOpacity onPress={() => deleteExpense(item.id)} style={styles.delBtn}><Text style={{color:'white'}}>×</Text></TouchableOpacity>
              </View>
            </View>
          );
        })}
        <View style={{height: 220}} />
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.totalText}>TOTAL: {getSymbol(masterCurrency)}{formatValue(totals.grand)}</Text>
        <TouchableOpacity style={styles.shareBtn} onPress={sharePDF}><Text style={styles.btnText}>📤 EXPORT REPORT</Text></TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: { padding: 20, paddingTop: 50, backgroundColor: '#ffffff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  appTitle: { fontSize: 22, fontWeight: '900', color: '#1e293b', textAlign: 'center' },
  authorTag: { fontSize: 10, color: '#64748b', textAlign: 'center', marginTop: 2 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 5 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between' },
  tripPicker: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 12, height: 45, justifyContent: 'center' },
  iconBtn: { backgroundColor: '#f1f5f9', width: 45, height: 45, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  plusBtn: { backgroundColor: '#10b981', width: 45, height: 45, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  plusText: { color: 'white', fontSize: 24, fontWeight: 'bold' },
  homeCurrencyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  currencyPickerWrapper: { width: 140, backgroundColor: '#f1f5f9', borderRadius: 12, height: 40, justifyContent: 'center' },
  subText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  summaryCard: { backgroundColor: '#f8fafc', margin: 15, padding: 15, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  summaryTitle: { color: '#64748b', fontSize: 10, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  legendText: { color: '#1e293b', fontSize: 11, fontWeight: '700' },
  inputCard: { backgroundColor: '#ffffff', margin: 15, padding: 15, borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0' },
  input: { backgroundColor: '#f1f5f9', borderRadius: 12, padding: 12, color: '#1e293b', marginBottom: 10 },
  halfPicker: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 12, height: 50, justifyContent: 'center' },
  submitBtn: { backgroundColor: '#10b981', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  btnText: { color: 'white', fontWeight: 'bold' },
  card: { flexDirection: 'row', backgroundColor: '#ffffff', marginHorizontal: 15, marginBottom: 10, padding: 15, borderRadius: 16, borderBottomWidth: 1, borderColor: '#f1f5f9', alignItems: 'center' },
  sortCol: { marginRight: 15, alignItems: 'center' },
  cardDate: { fontSize: 10, color: '#94a3b8', fontWeight: '600' },
  cardDesc: { color: '#1e293b', fontWeight: 'bold', fontSize: 15 },
  rateText: { color: '#10b981', fontSize: 10, fontWeight: 'bold', marginTop: 2 },
  cardSmall: { fontSize: 11, color: '#64748b' },
  cardAmt: { color: '#10b981', fontWeight: 'bold', fontSize: 17 },
  methodText: { fontSize: 10, color: '#3b82f6', fontWeight: 'bold' },
  delBtn: { backgroundColor: '#f56565', width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  footer: { position: 'absolute', bottom: 0, width: '100%', backgroundColor: '#ffffff', padding: 20, borderTopWidth: 1, borderColor: '#e2e8f0' },
  totalText: { color: '#1e293b', fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 10 },
  shareBtn: { backgroundColor: '#3b82f6', padding: 15, borderRadius: 12, alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: 'white', padding: 20, borderRadius: 20, width: '80%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  modalInput: { backgroundColor: '#f1f5f9', padding: 12, borderRadius: 10, marginBottom: 20 },
  modalBtn: { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center', marginHorizontal: 5, backgroundColor: '#10b981' }
});