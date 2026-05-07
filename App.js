import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, SafeAreaView, ScrollView, Modal, Platform, Image, Switch, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

// ☁️ FIREBASE V10+ CLOUD IMPORTS ☁️
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc } from 'firebase/firestore';

 // 🔥 2. PASTE YOUR EXACT FIREBASE KEYS BELOW 🔥
    const firebaseConfig = {
      apiKey:  "AIzaSyD9Bob9hhOSbJsoNU__qf3zi8WXcuki-1s",
      authDomain: "travelexpense-52ccf.firebaseapp.com",
      projectId: "travelexpense-52ccf",
      storageBucket: "travelexpense-52ccf.firebasestorage.app",
      messagingSenderId: "235580007081",
      appId: "1:235580007081:web:32d66963c575c8dddfbfb8"
    };
    
// 🚀 IGNITE THE CLOUD ENGINE
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const CATEGORIES = ["🍔 Food", "🏨 Hotel", "🚕 Transport", "🛍️ Shopping", "🎟️ Other"];
const PAYMENTS = ["Cash 💵", "Credit Card 💳", "Debit Card 💳", "Forex Card 💳", "UPI 📲"];
const CURRENCIES = [
  { label: "🇮🇳 INR (₹)", value: "INR", symbol: "₹" },
  { label: "🇺🇸 USD ($)", value: "USD", symbol: "$" },
  { label: "🇻🇳 VND (₫)", value: "VND", symbol: "₫" },
  { label: "🇪🇺 EUR (€)", value: "EUR", symbol: "€" },
  { label: "🇬🇧 GBP (£)", value: "GBP", symbol: "£" }
];

const LOCATIONS = [
  { country: "🇮🇳 India", cities: ["Mumbai", "Delhi", "Goa", "Bangalore", "Hyderabad", "Ahmedabad" , "Chennai"] },
  { country: "🇻🇳 Vietnam", cities: ["Hanoi", "Ho Chi Minh", "Da Nang", "Hoi An"] },
  { country: "🇺🇸 USA", cities: ["New York", "LA", "Vegas", "Chicago"] },
  { country: "🇪🇺 Europe", cities: ["Paris", "London", "Rome", "Amsterdam"] }
];

export default function App() {
  const scrollRef = useRef(null);
  const [appLoaded, setAppLoaded] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);

  const [currentTab, setCurrentTab] = useState('Home');
  const [trips, setTrips] = useState({});
  const [tripBudgets, setTripBudgets] = useState({});
  const [tripDays, setTripDays] = useState({});
  const [activeTrip, setActiveTrip] = useState('');
  const [masterCurrency, setMasterCurrency] = useState('INR');
  const [rates, setRates] = useState({});
  
  const [appSettings, setAppSettings] = useState({ showSplit: false, showSync: false });
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);

  const [expenseModalVisible, setExpenseModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateObj, setDateObj] = useState(new Date());
  const [isDateSelected, setIsDateSelected] = useState(false);
  const [txType, setTxType] = useState('Debit');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [amount1, setAmount1] = useState('');
  const [currency1, setCurrency1] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [isSplit, setIsSplit] = useState(false);
  const [splitNames, setSplitNames] = useState('');

  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState('add');
  const [newTripName, setNewTripName] = useState('');
  const [newTripBudget, setNewTripBudget] = useState('');
  const [newTripDays, setNewTripDays] = useState('');
  const [kittyContributors, setKittyContributors] = useState('');
  const [tripStyle, setTripStyle] = useState('solo');
  
  const [syncModalVisible, setSyncModalVisible] = useState(false);
  const [syncAmount, setSyncAmount] = useState('');
  const [syncCurrency, setSyncCurrency] = useState('VND');
  const [showWrapped, setShowWrapped] = useState(false);
  const [wrappedStep, setWrappedStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setLoadProgress(p => p < 100 ? p + 5 : 100), 100);
    setTimeout(() => { clearInterval(interval); setAppLoaded(true); }, 2500);
  }, []);

  const loadAllData = useCallback(async () => {
    const v6 = await AsyncStorage.getItem('@nexus_v6_pro');
    if (v6) {
      const p = JSON.parse(v6);
      setTrips(p.trips || {});
      setTripBudgets(p.budgets || {});
      setTripDays(p.days || {});
      setAppSettings(p.settings || { showSplit: false, showSync: false });
      setMasterCurrency(p.masterCurrency || 'INR');
      if (p.activeTrip) setActiveTrip(p.activeTrip);
    }
  }, []);

  const fetchRates = useCallback(async () => {
    try {
      // 🔄 Switched to a free, open API that requires NO keys!
      const res = await fetch(`https://open.er-api.com/v6/latest/${masterCurrency}`);
      const d = await res.json();
      
      // The open API uses 'rates' instead of 'conversion_rates'
      if (d.rates) setRates(d.rates);
    } catch (e) { 
      console.log("Rate fetch failed: ", e); 
    }
  }, [masterCurrency]);

  useEffect(() => { loadAllData(); }, [loadAllData]);
  useEffect(() => { fetchRates(); }, [fetchRates]);

// ☁️ THE LIVE CLOUD SYNC ENGINE ☁️
  useEffect(() => {
    // 1. Target your exact database collection
    const q = query(collection(db, "trips"));
    
    // 2. Open the real-time ear to the cloud
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cloudTrips = {};
      
      // 3. Group all downloaded expenses by their trip name
      snapshot.forEach((doc) => {
        const data = doc.data();
        const tripName = data.tripName; 
        
        if (tripName) {
          if (!cloudTrips[tripName]) cloudTrips[tripName] = [];
          // Inject the true Firebase Document ID into the app
          cloudTrips[tripName].push({ ...data, id: doc.id }); 
        }
      });

      // 4. Sort the dates so the newest expenses stay at the top
      Object.keys(cloudTrips).forEach(t => {
        cloudTrips[t].sort((a, b) => new Date(b.date) - new Date(a.date));
      });

      // 5. Instantly overwrite the local phone screen with the new Cloud Truth
      setTrips(prevLocalTrips => ({
        ...prevLocalTrips,
        ...cloudTrips
      }));
      
      console.log("☁️ Live Sync: Connected and UI updated!");
    });

    // Safely disconnect the antenna if the app crashes or closes
    return () => unsubscribe();
  }, []);

  const saveData = async (t, a, m, b, d, s) => {
    await AsyncStorage.setItem('@nexus_v6_pro', JSON.stringify({ trips: t, activeTrip: a, masterCurrency: m, budgets: b, days: d, settings: s }));
  };

  const currentExpenses = useMemo(() => (activeTrip ? trips[activeTrip] || [] : []), [trips, activeTrip]);
  const currentBudget = tripBudgets[activeTrip] || 0;
  const currentDays = tripDays[activeTrip] || 0;
  
  const getConvertedAmount = useCallback((amount, fromCurrency) => {
    if (fromCurrency === masterCurrency) return amount;
    const rate = rates[fromCurrency];
    return rate ? amount / rate : amount;
  }, [rates, masterCurrency]);

  const formatValue = (n) => parseFloat(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const getSymbol = (code) => CURRENCIES.find(c => c.value === code)?.symbol || "";

  const resetForm = () => {
    setEditingId(null); setDateObj(new Date()); setIsDateSelected(false); setTxType('Debit');
    setCountry(''); setCity(''); setDescription(''); setCategory(''); setCustomCategory('');
    setAmount1(''); setCurrency1(''); setPaymentMethod(''); setIsSplit(false); setSplitNames('');
    setExpenseModalVisible(false);
  };

  const totals = useMemo(() => {
    let cash = 0, nonCash = 0, splitsTotal = 0;
    currentExpenses.forEach(e => {
      const amt = getConvertedAmount(e.amount_1, e.currency_1);
      const factor = e.type === 'Credit' ? -1 : 1;
      if (e.method === 'Cash 💵') cash += (amt * factor);
      else nonCash += (amt * factor);
      if (e.split && e.splitNames) {
         const sf = e.splitNames.split(',').length + 1;
         splitsTotal += ((amt / sf) * factor); 
      }
    });
    return { cash, nonCash, grand: cash + nonCash, splitsTotal };
  }, [currentExpenses, getConvertedAmount]);

// 🏆 TRAVEL BADGES LOGIC
  const badges = useMemo(() => {
    if (!currentExpenses.length) return [];
    let b = [];
    if (currentBudget > 0 && totals.grand <= currentBudget) b.push({ icon: '👑', title: 'Budget Master', desc: 'Stayed under budget' });
    
    // Added safety fallback (e.category || "") to prevent old data crashes!
    const foodTotal = currentExpenses.filter(e => (e.category || "").includes("Food")).reduce((s, e) => s + getConvertedAmount(e.amount_1 || 0, e.currency_1), 0);
    if (totals.grand > 0 && foodTotal / totals.grand > 0.4) b.push({ icon: '🍔', title: 'Ultimate Foodie', desc: '>40% spent on food' });
    
    if (totals.cash > totals.nonCash) b.push({ icon: '💵', title: 'Cash King', desc: 'Preferred physical cash' });
    if (appSettings.showSplit && totals.splitsTotal > 0) b.push({ icon: '🏦', title: 'The Banker', desc: 'Managed the group splits' });
    if (currentExpenses.length >= 10) b.push({ icon: '💸', title: 'Serial Spender', desc: 'Logged 10+ expenses' });
    if (b.length === 0) b.push({ icon: '🎒', title: 'Smart Traveler', desc: 'Logged your journey' });
    return b;
  }, [currentExpenses, totals, currentBudget, appSettings]);

  // 🎁 WRAPPED TOP EXPENSE LOGIC
  const topExpense = useMemo(() => {
    if (!currentExpenses.length) return null;
    return [...currentExpenses].sort((a, b) => getConvertedAmount(b.amount_1 || 0, b.currency_1) - getConvertedAmount(a.amount_1 || 0, a.currency_1))[0];
  }, [currentExpenses, getConvertedAmount]);

  const advanceWrapped = () => {
    if (wrappedStep < 3) setWrappedStep(wrappedStep + 1);
    else { setShowWrapped(false); setWrappedStep(0); }
  };

  const handleWalletSync = () => {
    const actualAmount = parseFloat(syncAmount);
    if (isNaN(actualAmount)) return Alert.alert('Error', 'Enter a valid amount');
    let currentBalance = 0;
    currentExpenses.forEach(e => {
      if (e.method === 'Cash 💵' && e.currency_1 === syncCurrency) {
         currentBalance += e.type === 'Credit' ? e.amount_1 : -e.amount_1;
      }
    });
    const difference = actualAmount - currentBalance;
    if (difference === 0) { Alert.alert("All Good!", "Your wallet already perfectly matches the app."); setSyncModalVisible(false); return; }

    const exp = {
      id: Date.now().toString(), date: new Date().toISOString().split('T')[0],
      type: difference > 0 ? 'Credit' : 'Debit', country: 'Auto', city: 'Wallet Sync',
      description: 'Wallet Sync Auto-Correction', category: '🎟️ Other', amount_1: Math.abs(difference),
      currency_1: syncCurrency, method: 'Cash 💵', split: false, splitNames: ''
    };
    const t = { ...trips, [activeTrip]: [exp, ...currentExpenses] };
    setTrips(t); saveData(t, activeTrip, masterCurrency, tripBudgets, tripDays, appSettings);
    setSyncModalVisible(false); setSyncAmount('');
    Alert.alert("Wallet Synced!", "Adjustment entry created.");
  };

const handleSaveExpense = async () => { 
    if (!isDateSelected || !country || !city || !description || !category || !amount1 || !currency1 || !paymentMethod) {
      return Alert.alert('Error', 'Please fill out all fields before saving.');
    }

    // 1. HIDE MODAL INSTANTLY (Physically blocks the double-tap bug)
    setExpenseModalVisible(false);

    // 2. CAPTURE THE ID 
    const currentEditId = editingId;
    const finalCat = category === "🎟️ Other" ? `🎟️ ${customCategory || 'Other'}` : category;
    
    const exp = { 
      id: currentEditId || Date.now().toString(), 
      date: dateObj.toISOString().split('T')[0], 
      type: txType, country, city, description, category: finalCat, 
      amount_1: parseFloat(amount1), currency_1: currency1, method: paymentMethod, split: isSplit, splitNames 
    };

    let updated = currentEditId ? currentExpenses.map(i => i.id === currentEditId ? exp : i) : [exp, ...currentExpenses];
    updated.sort((a, b) => new Date(b.date) - new Date(a.date));
    const t = { ...trips, [activeTrip]: updated };
    
    // 3. SAVE LOCALLY (Keeps the UI lightning fast)
    setTrips(t);
    saveData(t, activeTrip, masterCurrency, tripBudgets, tripDays, appSettings);
    
    // ☁️ 4. FIREBASE CLOUD SAVE & EDIT ☁️
    try {
      if (currentEditId) {
        // ✏️ IF EDITING: Update the exact document in the cloud
        const docRef = doc(db, "trips", currentEditId);
        await updateDoc(docRef, {
          ...exp,
          tripName: activeTrip,
          lastEdited: new Date().toISOString()
        });
        console.log("✏️ Cloud Edit Success!");
      } else {
        // ➕ IF NEW: Shoot a brand new document to the cloud
        await addDoc(collection(db, "trips"), {
          ...exp,
          tripName: activeTrip,
          user: "Shitanshu", 
          timestamp: new Date().toISOString() 
        });
        console.log("✅ Cloud Save Success!");
      }
    } catch (error) {
      console.error("❌ Firebase Error: ", error);
    }

    // 5. CLEAR MEMORY SAFELY AT THE VERY END
    resetForm(); 
  };

  const startEdit = (item) => {
    setEditingId(item.id); setDateObj(new Date(item.date)); setIsDateSelected(true);
    setTxType(item.type || 'Debit'); setCountry(item.country || ''); setCity(item.city || '');
    setDescription(item.description); setAmount1(item.amount_1.toString()); setCurrency1(item.currency_1); 
    setPaymentMethod(item.method); setIsSplit(item.split || false); setSplitNames(item.splitNames || ''); 
    if (item.category.startsWith('🎟️')) { setCategory("🎟️ Other"); setCustomCategory(item.category.replace('🎟️ ', '')); } 
    else { setCategory(item.category); }
    setExpenseModalVisible(true);
  };

  const handleTripSave = () => {
    if (!newTripName) return;
    const t = { ...trips }; const b = { ...tripBudgets }; const d = { ...tripDays };
    let s = { ...appSettings };
    
    if (modalMode === 'add') {
      t[newTripName] = [];
      b[newTripName] = parseFloat(newTripBudget) || 0; 
      d[newTripName] = parseInt(newTripDays) || 0;
      setActiveTrip(newTripName);
      
      // 🚨 THE NEW KITTY SAVE LOGIC 🚨
      if (tripStyle === 'solo') s = { showSplit: false, showSync: false, isKitty: false };
      else if (tripStyle === 'group') s = { showSplit: true, showSync: false, isKitty: false };
      else if (tripStyle === 'pro') s = { showSplit: true, showSync: true, isKitty: false };
      else if (tripStyle === 'kitty') s = { showSplit: false, showSync: false, isKitty: true, contributors: kittyContributors };
      
      setAppSettings(s);
    } else {
      if (newTripName !== activeTrip) {
        t[newTripName] = t[activeTrip];
        delete t[activeTrip];
        b[newTripName] = parseFloat(newTripBudget) || 0; delete b[activeTrip];
        d[newTripName] = parseInt(newTripDays) || 0; delete d[activeTrip];
        setActiveTrip(newTripName);
      } else {
        b[activeTrip] = parseFloat(newTripBudget) || 0;
        d[activeTrip] = parseInt(newTripDays) || 0;
      }
    }
    setTrips(t); setTripBudgets(b); setTripDays(d); saveData(t, newTripName || activeTrip, masterCurrency, b, d, s);
    setModalVisible(false);
    resetForm(); 
  };

  const confirmDeleteTrip = () => {
    if (!activeTrip) return;
    Alert.alert("Delete Trip", `Are you sure you want to permanently delete "${activeTrip}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => {
          const newTrips = { ...trips };
          delete newTrips[activeTrip];
          
          const newBudgets = { ...tripBudgets };
          delete newBudgets[activeTrip];
          
          const newDays = { ...tripDays };
          delete newDays[activeTrip];

          setTrips(newTrips);
          setTripBudgets(newBudgets);
          setTripDays(newDays);
          
          // CRITICAL FIX: Set the active trip to blank ("") so the app goes to the Landing Screen
          setActiveTrip(""); 
          saveData(newTrips, "", masterCurrency, newBudgets, newDays, appSettings);
      }}
    ]);
  };

  const confirmDeleteExpense = (itemId) => {
    Alert.alert("Delete Expense", "Are you sure you want to delete this entry?", [
      { text: "Cancel", style: "cancel" }, 
      { text: "Delete", style: "destructive", onPress: async () => { // 👈 Notice the 'async' added here!
          
          // ☁️ FIREBASE CLOUD DELETE ☁️
          try {
            // This physically deletes the document from the Google Cloud
            await deleteDoc(doc(db, "trips", itemId));
            console.log("🗑️ Cloud Delete Success!");
          } catch (error) {
            console.error("❌ Firebase Delete Error: ", error);
          }

          // We keep your local save code here so the phone feels lightning fast
          const u = currentExpenses.filter(e => e.id !== itemId); 
          const t = { ...trips, [activeTrip]: u }; 
          setTrips(t); 
          saveData(t, activeTrip, masterCurrency, tripBudgets, tripDays, appSettings); 
          resetForm();
      }}
    ]);
  };

  const sharePDF = async () => {
    const symbol = getSymbol(masterCurrency);
    const hasSplits = currentExpenses.some(e => e.split); 
    let tableHeader = hasSplits 
      ? `<th>Date</th><th>Category</th><th>Description</th><th>Method</th><th>Orig. Amt</th><th>Split With</th><th>Split Amt</th><th>Total (${masterCurrency})</th>`
      : `<th>Date</th><th>Category</th><th>Description</th><th>Method</th><th>Orig. Amt</th><th>Total (${masterCurrency})</th>`;

    const html = `<html><body style="font-family:sans-serif;padding:20px;">
      <h1 style="text-align:center;">${activeTrip} Report</h1>
      <div style="background:#f1f5f9; padding:15px; border-radius:10px; margin-bottom:20px;">
        <p><strong>Grand Total:</strong> ${symbol}${formatValue(totals.grand)}</p>
        <p>Cash: ${symbol}${formatValue(totals.cash)} | Card/UPI: ${symbol}${formatValue(totals.nonCash)} ${hasSplits ? `| Your Split Share Total: ${symbol}${formatValue(totals.splitsTotal)}` : ''}</p>
      </div>
      <table style="width:100%;border-collapse:collapse; text-align:left;">
        <tr style="background:#3b82f6; color:#fff;">${tableHeader}</tr>
        ${currentExpenses.map(e => {
          const totalConv = getConvertedAmount(e.amount_1, e.currency_1);
          const sf = e.split ? (e.splitNames.split(',').length + 1) : 1;
          if (hasSplits) {
            return `<tr><td style="border:1px solid #ddd;padding:5px;">${e.date}</td><td style="border:1px solid #ddd;padding:5px;">${e.category}</td><td style="border:1px solid #ddd;padding:5px;">${e.description}</td><td style="border:1px solid #ddd;padding:5px;">${e.method}</td><td style="border:1px solid #ddd;padding:5px;">${e.amount_1} ${e.currency_1}</td><td style="border:1px solid #ddd;padding:5px;">${e.split ? e.splitNames : '-'}</td><td style="border:1px solid #ddd;padding:5px;">${e.split ? `${symbol}${formatValue(totalConv/sf)}` : '-'}</td><td style="border:1px solid #ddd;padding:5px;">${symbol}${formatValue(totalConv)}</td></tr>`;
          } else {
            return `<tr><td style="border:1px solid #ddd;padding:5px;">${e.date}</td><td style="border:1px solid #ddd;padding:5px;">${e.category}</td><td style="border:1px solid #ddd;padding:5px;">${e.description}</td><td style="border:1px solid #ddd;padding:5px;">${e.method}</td><td style="border:1px solid #ddd;padding:5px;">${e.amount_1} ${e.currency_1}</td><td style="border:1px solid #ddd;padding:5px;">${symbol}${formatValue(totalConv)}</td></tr>`;
          }
        }).join('')}
      </table></body></html>`;

    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri);
  };

  const sendWhatsApp = (name, amount) => {
    const msg = `Hey ${name}, your share of the expenses for this trip is ${getSymbol(masterCurrency)}${formatValue(amount)}!`;
    Linking.openURL(`whatsapp://send?text=${encodeURIComponent(msg)}`).catch(() => Alert.alert('Error', 'WhatsApp is not installed on your device.'));
  };

  if (!appLoaded) {
    return (
      <SafeAreaView style={[styles.container, {justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f9ff'}]}>
        {/* Fixed Android Elevation Cutoff */}
        <View style={{position: 'absolute', top: 0, width: '100%', height: '45%', backgroundColor: '#ffffff', borderBottomLeftRadius: 100, borderBottomRightRadius: 100, elevation: 1, shadowColor: '#3b82f6', shadowOpacity: 0.05, shadowRadius: 30}} />
        
        <View style={{alignItems: 'center', zIndex: 10, elevation: 10, marginBottom: 30}}>
          <View style={{backgroundColor: '#fff', padding: 25, borderRadius: 35, shadowColor: '#3b82f6', shadowOffset: {width: 0, height: 10}, shadowOpacity: 0.15, shadowRadius: 20, elevation: 5, marginBottom: 25}}>
            <Text style={{fontSize: 60}}>✈️☁️</Text>
          </View>
          <Text style={{fontSize: 32, fontWeight: '900', color: '#1e3a8a', letterSpacing: 0.5}}>Travel Tracker</Text>
          <Text style={{fontSize: 12, fontWeight: 'bold', color: '#3b82f6', marginTop: 8, letterSpacing: 1}}>SYNCING JOURNEY DATA...</Text>
        </View>

        <View style={{width: '45%', height: 8, backgroundColor: '#e0f2fe', borderRadius: 10, overflow: 'hidden', zIndex: 10, elevation: 10}}>
          <View style={{width: `${loadProgress}%`, height: '100%', backgroundColor: '#3b82f6', borderRadius: 10}} />
        </View>
      </SafeAreaView>
    );
  }

// 📊 CSV / EXCEL EXPORT LOGIC
  const shareCSV = async () => {
    try {
      // 1. Create the Header Row for Excel
      let csvString = "Date,City,Category,Description,Original Amount,Currency,Converted Amount,Type,Split Details\n";

      // 2. Loop through every expense and create a new row
      currentExpenses.forEach(item => {
        const conv = getConvertedAmount(item.amount_1, item.currency_1);
        
        // Safety check: Wrap text in quotes so commas in descriptions don't break the Excel columns
        const cleanCity = `"${(item.city || '').replace(/"/g, '""')}"`;
        const cleanDesc = `"${(item.description || '').replace(/"/g, '""')}"`;
        const cleanCat = `"${(item.category || '').replace(/"/g, '""')}"`;
        const cleanSplit = item.split ? `"Yes (${item.splitNames})"` : `"No"`;

        csvString += `${item.date},${cleanCity},${cleanCat},${cleanDesc},${item.amount_1},${item.currency_1},${conv.toFixed(2)},${item.type},${cleanSplit}\n`;
      });

      // 3. Save the file to the phone's temporary documents folder
      const fileUri = FileSystem.documentDirectory + `${activeTrip.replace(/\s+/g, '_')}_Report.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csvString);

      // 4. Open the native Share menu (WhatsApp, Email, etc.)
      await Sharing.shareAsync(fileUri);
    } catch (error) {
      console.log("Error generating CSV: ", error);
      alert("Could not generate Excel file. Try again.");
    }
  };

const renderHome = () => (
    <View style={{flex: 1}}>
      <ScrollView ref={scrollRef} stickyHeaderIndices={[0]}>
        <View style={styles.header}>
          <View style={styles.rowBetween}>
            <View style={{width: 24}} /> {/* Invisible spacer */}
            <Text style={styles.appTitle}>EXPENSE TRACKER</Text>
            <TouchableOpacity onPress={() => setSettingsModalVisible(true)}><Text style={{fontSize: 24}}>⚙️</Text></TouchableOpacity>
          </View>
          
          <View style={styles.homeCurrencyRow}>
              <Text style={styles.subText}>Home Currency: </Text>
              <View style={styles.currencyPickerWrapper}>
                <Picker style={{color:'#000'}} dropdownIconColor="#000" selectedValue={masterCurrency} onValueChange={(m) => { setMasterCurrency(m); saveData(trips, activeTrip, m, tripBudgets, tripDays, appSettings); }}>
                  {CURRENCIES.map(c => <Picker.Item key={c.value} label={c.label} value={c.value} />)}
                </Picker>
              </View>
          </View>

          <View style={styles.row}>
            <View style={styles.tripPicker}><Picker style={{color:'#000'}} dropdownIconColor="#000" selectedValue={activeTrip} onValueChange={(val) => {setActiveTrip(val); resetForm();}}><Picker.Item label="Select Trip" value="" />{Object.keys(trips).map(t => <Picker.Item key={t} label={t} value={t} />)}</Picker></View>
            <TouchableOpacity style={styles.iconBtn} onPress={() => {setModalMode('edit'); setNewTripName(activeTrip); setNewTripBudget(currentBudget.toString()); setNewTripDays(currentDays.toString()); setModalVisible(true)}}><Text>✏️</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.iconBtn, {backgroundColor: '#fee2e2'}]} onPress={confirmDeleteTrip}><Text>🗑️</Text></TouchableOpacity>
            <TouchableOpacity style={styles.plusBtn} onPress={() => {setModalMode('add'); setNewTripName(''); setNewTripBudget(''); setNewTripDays(''); setTripStyle('solo'); setKittyContributors(''); setModalVisible(true)}}><Text style={styles.plusText}>+</Text></TouchableOpacity>
          </View>

{/* THE DASHBOARD LANDING SCREEN */}
          {activeTrip === "" ? (
            <View style={{paddingTop: 40, alignItems: 'center', paddingHorizontal: 20}}>
              <Text style={{fontSize: 60, marginBottom: 10}}>✈️</Text>
              <Text style={{fontSize: 24, fontWeight: '900', color: '#1e293b', textAlign: 'center'}}>Where to next?</Text>
              <Text style={{fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 10, marginBottom: 30}}>
                Select an existing itinerary from the dropdown above, or start a brand new journey.
              </Text>
              
              <TouchableOpacity 
                style={{backgroundColor: '#3b82f6', width: '100%', padding: 20, borderRadius: 16, alignItems: 'center', shadowColor: '#3b82f6', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5}}
                onPress={() => {setModalMode('add'); setNewTripName(''); setNewTripBudget(''); setNewTripDays(''); setTripStyle('solo'); setKittyContributors(''); setModalVisible(true)}}>
                <Text style={{color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1}}>➕ CREATE NEW TRIP</Text>
              </TouchableOpacity>

              {Object.keys(trips).length > 0 && (
                <View style={{width: '100%', marginTop: 30}}>
                  <Text style={{fontSize: 12, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 10}}>Recent Destinations</Text>
                  {Object.keys(trips).slice(0, 3).map(tripName => (
                    <TouchableOpacity key={tripName} style={{backgroundColor: '#f8fafc', padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row', justifyContent: 'space-between'}} onPress={() => setActiveTrip(tripName)}>
                      <Text style={{fontWeight: 'bold', color: '#334155'}}>{tripName}</Text>
                      <Text style={{color: '#3b82f6'}}>→</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          ) : (
            /* THE STANDARD EXPENSE TRACKER UI */
            <View style={{flex: 1}}>
              {!appSettings.isKitty && (
                <View style={styles.summaryCardCompact}>
                    <Text style={styles.legendText}>🟢 Cash: {getSymbol(masterCurrency)}{formatValue(totals.cash)}</Text>
                    <Text style={styles.legendText}>🔵 Card: {getSymbol(masterCurrency)}{formatValue(totals.nonCash)}</Text>
                    {(appSettings.showSplit && totals.splitsTotal > 0) ? <Text style={styles.legendText}>🟣 Splits: {getSymbol(masterCurrency)}{formatValue(totals.splitsTotal)}</Text> : null}
                </View>
              )}
              
              {appSettings.showSync && !appSettings.isKitty && (
                <TouchableOpacity style={styles.syncBtn} onPress={() => {setSyncAmount(''); setSyncModalVisible(true);}}>
                    <Text style={styles.syncBtnText}>⚖️ Auto-Sync Physical Wallet</Text>
                </TouchableOpacity>
              )}
              
              {!appSettings.isKitty && (
                <Text style={styles.grandTotalText}>Grand Total: {getSymbol(masterCurrency)}{formatValue(totals.grand)}</Text>
              )}

              {currentBudget > 0 ? (
                <View style={styles.budgetContainer}>
                  {appSettings.isKitty ? (
                    <View style={{backgroundColor: '#f8fafc', padding: 18, borderRadius: 20, marginTop: 10, borderWidth: 1, borderColor: '#e2e8f0', elevation: 2}}>
                      <View style={styles.rowBetween}>
                        <Text style={{fontSize: 14, fontWeight: '900', color: '#64748b', textTransform: 'uppercase'}}>Shared Kitty</Text>
                        <TouchableOpacity 
                          style={{backgroundColor: '#3b82f6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10}}
                          onPress={() => {
                            setModalMode('edit'); 
                            setNewTripName(activeTrip); 
                            setNewTripBudget(currentBudget.toString()); 
                            setNewTripDays(currentDays.toString()); 
                            setModalVisible(true);
                          }}>
                          <Text style={{color: '#fff', fontSize: 11, fontWeight: '900'}}>➕ TOP-UP</Text>
                        </TouchableOpacity>
                      </View>
                      
                      <Text style={{fontSize: 32, fontWeight: '900', color: (currentBudget - totals.grand) < (currentBudget * 0.15) ? '#ef4444' : '#10b981', marginVertical: 10}}>
                        {getSymbol(masterCurrency)}{formatValue(currentBudget - totals.grand)}
                      </Text>
                      
                      <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${Math.max(0, ((currentBudget - totals.grand)/currentBudget))*100}%`, backgroundColor: ((currentBudget - totals.grand)/currentBudget) < 0.15 ? '#ef4444' : '#10b981' }]} />
                      </View>
                      <Text style={[styles.paceMakerText, {marginTop: 10, color: '#64748b'}]}>👥 Contributors: {appSettings.contributors || "The Group"}</Text>
                    </View>
                  ) : (
                    <View>
                      <View style={styles.budgetHeader}>
                        <Text style={styles.budgetLabel}>Budget Status</Text>
                        <Text style={styles.budgetLabel}>{getSymbol(masterCurrency)}{formatValue(totals.grand)} / {formatValue(currentBudget)}</Text>
                      </View>
                      <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${Math.min(totals.grand/currentBudget, 1)*100}%`, backgroundColor: (totals.grand/currentBudget) > 0.9 ? '#ef4444' : '#10b981' }]} />
                      </View>
                      
                      {currentDays > 0 ? (() => {
                        const daysLogged = new Set(currentExpenses.map(e => e.date)).size || 1;
                        const daysRemaining = Math.max(1, currentDays - daysLogged + 1);
                        const originalDaily = currentBudget / currentDays;
                        const expectedSpendSoFar = originalDaily * daysLogged;
                        const rolloverAmount = expectedSpendSoFar - totals.grand;
                        const newDaily = Math.max(0, (currentBudget - totals.grand) / daysRemaining);
                        
                        return (
                          <View style={{marginTop: 12, backgroundColor: '#f0fdf4', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#bbf7d0'}}>
                            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                              <Text style={{fontWeight: '900', color: '#166534', fontSize: 13}}>🎯 Pace-Maker Active</Text>
                              {rolloverAmount > 0 ? (
                                <Text style={{backgroundColor: '#dcfce7', color: '#15803d', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, fontSize: 10, fontWeight: 'bold'}}>
                                  +{getSymbol(masterCurrency)}{formatValue(rolloverAmount)} SAVED
                                </Text>
                              ) : rolloverAmount < 0 ? (
                                <Text style={{backgroundColor: '#fee2e2', color: '#b91c1c', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, fontSize: 10, fontWeight: 'bold'}}>
                                  OVERSPENT
                                </Text>
                              ) : null}
                            </View>
                            <Text style={{color: '#15803d', fontSize: 12, marginTop: 6, fontWeight: '500'}}>
                              Safe to spend today: <Text style={{fontWeight: '900'}}>{getSymbol(masterCurrency)}{formatValue(newDaily)}</Text>
                            </Text>
                          </View>
                        );
                      })() : null}
                    </View>
                  )}
                </View>
              ) : null}

              <View style={{height: 15}} />
              
              {currentExpenses.map(item => {
                const conv = getConvertedAmount(item.amount_1, item.currency_1);
                const rate = rates[item.currency_1] ? (1 / rates[item.currency_1]).toFixed(4) : "1.00";
                const sf = item.split && item.splitNames ? item.splitNames.split(',').length + 1 : 1;
                return (
                  <TouchableOpacity key={item.id} style={styles.card} onPress={() => startEdit(item)}>
                    <View style={{flex: 1}}>
                        <Text style={styles.cardDate}>{item.date} • {item.city}</Text>
                        <Text style={styles.cardDesc}>{item.description}</Text>
                        <Text style={styles.cardCategory}>Category: {item.category}</Text>
                        <Text style={styles.cardOrigAmt}>Original: {formatValue(item.amount_1)} {item.currency_1}</Text>
                        <Text style={styles.rateText}>Rate: 1 {item.currency_1} = {rate} {masterCurrency}</Text>
                        {item.split && <Text style={styles.splitSubText}>👥 Share: {getSymbol(masterCurrency)}{formatValue(conv/sf)} per person</Text>}
                    </View>
                    <View style={{alignItems: 'flex-end'}}>
                        <Text style={[styles.cardAmt, {color: item.type === 'Credit' ? '#22c55e' : '#ef4444'}]}>{getSymbol(masterCurrency)}{formatValue(conv)}</Text>
                        <TouchableOpacity onPress={() => confirmDeleteExpense(item.id)}><Text style={{color:'red',fontSize:20, marginTop: 10}}>🗑️</Text></TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })}
              
              <TouchableOpacity style={styles.exportBtn} onPress={sharePDF}><Text style={styles.btnText}>📤 EXPORT PDF REPORT</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.exportBtn, {backgroundColor: '#10b981', marginTop: 10}]} onPress={shareCSV}><Text style={styles.btnText}>📊 EXPORT EXCEL (CSV)</Text></TouchableOpacity>
              <View style={{height: 150}} />
            </View>
          )}
        </View>
      </ScrollView>

      {/* ONLY SHOW THE FLOATING ACTION BUTTON IF A TRIP IS SELECTED */}
      {activeTrip !== "" && (
        <TouchableOpacity style={styles.fab} onPress={() => { resetForm(); setExpenseModalVisible(true); }}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderCharts = () => {
    const settlements = {};
    currentExpenses.filter(e => e.split && e.splitNames).forEach(e => {
        const friends = e.splitNames.split(',').map(n => n.trim()).filter(n => n);
        const share = getConvertedAmount(e.amount_1, e.currency_1) / (friends.length + 1);
        friends.forEach(f => { settlements[f] = (settlements[f] || 0) + share; });
    });

    return (
        <ScrollView style={{flex:1, padding: 20}}>
          <View style={{height: 40}} />
          
          {/* 🎁 THE TRIP WRAPPED BUTTON 🎁 */}
          {currentExpenses.length > 0 && (
            <TouchableOpacity style={{backgroundColor: '#8b5cf6', padding: 20, borderRadius: 20, alignItems: 'center', marginBottom: 20, shadowColor: '#8b5cf6', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.4, shadowRadius: 10, elevation: 5}} onPress={() => {setWrappedStep(0); setShowWrapped(true);}}>
              <Text style={{color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1}}>🎁 PLAY TRIP WRAPPED</Text>
              <Text style={{color: '#e2e8f0', fontSize: 12, marginTop: 4}}>Your personalized journey summary</Text>
            </TouchableOpacity>
          )}

          <Text style={[styles.appTitle, {marginBottom: 20}]}>ANALYTICS 📊</Text>

          {/* 🏆 THE BADGES SECTION 🏆 */}
          {badges.length > 0 && (
            <View style={styles.summaryCard}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 15}}>
                <Text style={{fontWeight: 'bold', color: '#1e293b', fontSize: 16}}>Travel Badges 🏆</Text>
                <Text style={{color: '#3b82f6', fontWeight: '900', fontSize: 12}}>
                  {badges[0]?.title === 'Smart Traveler' ? 0 : badges.length} / 5 UNLOCKED
                </Text>
              </View>
              <View style={{flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between'}}>
                {badges.map((b, i) => (
                  <View key={i} style={{width: '48%', backgroundColor: '#f8fafc', padding: 15, borderRadius: 12, marginBottom: 10, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0'}}>
                    <Text style={{fontSize: 32}}>{b.icon}</Text>
                    <Text style={{fontWeight: '900', color: '#1e293b', fontSize: 13, marginTop: 8, textAlign: 'center'}}>{b.title}</Text>
                    <Text style={{fontSize: 10, color: '#64748b', textAlign: 'center', marginTop: 4}}>{b.desc}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Category Spending</Text>
            {CATEGORIES.map(cat => {
              const total = currentExpenses.filter(e => (e.category || "").includes(cat)).reduce((s, e) => s + getConvertedAmount(e.amount_1 || 0, e.currency_1), 0);
              const perc = totals.grand > 0 ? (total / totals.grand) * 100 : 0;
              return (
                <View key={cat} style={{marginBottom: 15}}><View style={styles.rowBetween}><Text style={{color:'#000',fontWeight:'bold'}}>{cat}</Text><Text style={{color:'#000'}}>{perc.toFixed(0)}%</Text></View><View style={styles.progressBarBg}><View style={[styles.progressBarFill, {width: `${perc}%`, backgroundColor: '#3b82f6'}]} /></View></View>
              );
            })}
          </View>

          {appSettings.showSplit && !appSettings.isKitty && (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Who Owes You? 👥</Text>
              {Object.keys(settlements).length > 0 ? Object.entries(settlements).map(([n, a]) => (
                <View key={n} style={[styles.rowBetween, {marginBottom: 10}]}>
                  <Text style={{color:'#000',fontWeight:'bold', flex: 1}}>{n}</Text>
                  <Text style={{color:'#10b981',fontWeight:'bold', marginRight: 15}}>owes {getSymbol(masterCurrency)}{formatValue(a)}</Text>
                  <TouchableOpacity onPress={() => sendWhatsApp(n, a)}><Text style={{fontSize: 20}}>💬</Text></TouchableOpacity>
                </View>
              )) : <Text style={{color:'#64748b',fontSize:12}}>No split expenses recorded yet.</Text>}
            </View>
          )}
          <View style={{height: 100}} />
        </ScrollView>
    );
  };

  const renderGuide = () => (
    <ScrollView style={{flex:1, padding: 20}}>
      <View style={{height: 40}} /><Text style={[styles.appTitle, {marginBottom: 20}]}>HOW TO USE 📖</Text>
      
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>1. The "Stress-Free" Method</Text>
        <Text style={styles.featureListText}>Don't worry about tracking every penny of physical cash or currency exchange fees.</Text>
        <Text style={styles.featureListText}>• Just log everything you buy as a <Text style={{fontWeight:'bold', color:'#ef4444'}}>DEBIT</Text>.</Text>
        <Text style={styles.featureListText}>• The "Grand Total" shows exactly how much of your own money you have burned.</Text>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>2. Wallet Auto-Sync ⚖️</Text>
        <Text style={styles.featureListText}>Want the app to perfectly match the physical cash in your pocket?</Text>
        <Text style={styles.featureListText}>• Enable "Auto-Sync" in Settings (⚙️).</Text>
        <Text style={styles.featureListText}>• Count your physical cash (e.g. 238,000 VND).</Text>
        <Text style={styles.featureListText}>• Tap the "Auto-Sync Physical Wallet" button on the Home screen.</Text>
        <Text style={styles.featureListText}>• The app will find the missing leakage (bad exchange rates, lost coins) and silently fix the math for you!</Text>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>3. Splitting Bills 👥</Text>
        <Text style={styles.featureListText}>• Enable "Splits" in Settings (⚙️).</Text>
        <Text style={styles.featureListText}>• Toggle "Split with Friends" on any expense to YES.</Text>
        <Text style={styles.featureListText}>• Enter their names (e.g., Ajay, Rahul).</Text>
        <Text style={styles.featureListText}>• Tap the 💬 icon in the Analytics tab to instantly WhatsApp them their debt!</Text>
      </View>

      <View style={{height: 120}} />
    </ScrollView>
  );

  const renderFeatures = () => (
    <ScrollView style={{flex:1, padding: 20}}>
      <View style={{height: 40}} />
      <Text style={[styles.appTitle, {marginBottom: 20}]}>WHAT'S NEW 🚀</Text>
      <View style={[styles.summaryCard, {backgroundColor: '#eef2ff', borderColor: '#c7d2fe', borderWidth: 1}]}>
        <Text style={{fontWeight: '900', color: '#1e293b', fontSize: 16, marginBottom: 5}}>Travel Expense Tracker</Text>
        <Text style={{fontSize: 13, color: '#475569', lineHeight: 18, marginBottom: 10}}>A professional tool built to manage international spending, split costs with friends, and monitor budgets in real-time.</Text>
        <View style={{height: 1, backgroundColor: '#c7d2fe', marginBottom: 10}} />
        <Text style={{fontWeight: 'bold', color: '#3b82f6', fontSize: 11}}>DESIGNED & DEVELOPED BY:</Text>
        <Text style={{fontWeight: '900', color: '#1e293b', fontSize: 15, marginTop: 2}}>Shitanshu Chokshi</Text>
      </View>
      <View style={[styles.summaryCard, { padding: 0, overflow: 'hidden', height: 200, backgroundColor: '#f1f5f9' }]}>
        <Image source={{ uri: 'https://raw.githubusercontent.com/Shitanshu1901/Travel-Expense-Tracker/main/App%20Infographic.png' }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
      </View>
       <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>🌍 Smart Currency Engine</Text>
        <Text style={styles.featureListText}>• Real-Time Home Currency Switching</Text>
        <Text style={styles.featureListText}>• Live Exchange Rates via API</Text>
        <Text style={styles.featureListText}>• Historical Rate Tracking saved on cards</Text>
        <Text style={styles.featureListText}>• Dual Visibility of rates</Text>
      </View>
       <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>👥 Split-Cost Management</Text>
        <Text style={styles.featureListText}>• Multi-Person Splitting toggle</Text>
        <Text style={styles.featureListText}>• Per-person share display on expenses</Text>
        <Text style={styles.featureListText}>• "Who Owes Whom" settlement engine</Text>
      </View>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>📊 Analytics & Budgeting</Text>
        <Text style={styles.featureListText}>• Optional Trip Budgeting limits</Text>
        <Text style={styles.featureListText}>• Visual Budget Health Progress Bar</Text>
        <Text style={styles.featureListText}>• Category Spending visual graphs</Text>
      </View>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>📤 Professional Reporting</Text>
        <Text style={styles.featureListText}>• One-Tap PDF Export</Text>
        <Text style={styles.featureListText}>• Detailed Documentation when exported</Text>
        <Text style={styles.featureListText}>• CSV / Excel Export </Text>
        <Text style={styles.featureListText}>• Instantly export a raw data spreadsheet for your corporate accounting department.</Text>
      </View>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>🚀 Premium Features </Text>
        <Text style={styles.featureListText}>
          <Text style={{fontWeight: 'bold'}}>• Shared Kitty Mode: </Text>
          Transform your trip into a digital group envelope. Hide individual card/cash splits and focus purely on the group's remaining pool of money.
        </Text>
        
        <Text style={styles.featureListText}>
           <Text style={{fontWeight: 'bold'}}>• The Pace-Maker: </Text>
           Our smart engine monitors your daily spend. If you save money on Monday, it automatically rolls over your savings to increase your daily budget for Tuesday!
        </Text>
        
        <Text style={styles.featureListText}>
           <Text style={{fontWeight: 'bold'}}>• Travel Badges: </Text>
           Gamify your spending! The app secretly analyzes your habits to award you badges like 'Ultimate Foodie' and 'Cash King' in your Analytics tab.
        </Text>
        
        <Text style={styles.featureListText}>
           <Text style={{fontWeight: 'bold'}}>• Trip Wrapped: </Text>
           Relive your journey! Tap the purple button in Analytics to view an Instagram-style, shareable summary of your entire trip.
        </Text>
      </View>
      <View style={{height: 120}} />
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container}>

      {/* 🎁 INSTAGRAM-STYLE TRIP WRAPPED OVERLAY 🎁 */}
      <Modal visible={showWrapped} transparent animationType="fade">
        <TouchableOpacity activeOpacity={1} onPress={advanceWrapped} style={{flex: 1, backgroundColor: ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b'][wrappedStep], justifyContent: 'center', alignItems: 'center', padding: 30}}>
          {wrappedStep === 0 && (
            <View style={{alignItems: 'center'}}>
              <Text style={{fontSize: 80}}>✈️</Text>
              <Text style={{color: '#fff', fontSize: 36, fontWeight: '900', textAlign: 'center', marginTop: 20}}>{activeTrip}</Text>
              <Text style={{color: '#fff', fontSize: 24, fontWeight: 'bold', marginTop: 5}}>Wrapped</Text>
              <Text style={{color: '#fff', fontSize: 16, marginTop: 40, opacity: 0.8}}>Tap anywhere to begin</Text>
            </View>
          )}
          {wrappedStep === 1 && (
            <View style={{alignItems: 'center'}}>
              <Text style={{fontSize: 80}}>💸</Text>
              <Text style={{color: '#fff', fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginTop: 20}}>You spent a total of</Text>
              <Text style={{color: '#fff', fontSize: 44, fontWeight: '900', marginTop: 10}}>{getSymbol(masterCurrency)}{formatValue(totals.grand)}</Text>
            </View>
          )}
          {wrappedStep === 2 && topExpense && (
            <View style={{alignItems: 'center'}}>
              <Text style={{fontSize: 80}}>🛍️</Text>
              <Text style={{color: '#fff', fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginTop: 20}}>Your Biggest Splurge</Text>
              <Text style={{color: '#fff', fontSize: 32, fontWeight: '900', marginTop: 10, textAlign: 'center'}}>{topExpense.description}</Text>
              <Text style={{color: '#fff', fontSize: 20, marginTop: 10, opacity: 0.9}}>{getSymbol(masterCurrency)}{formatValue(getConvertedAmount(topExpense.amount_1, topExpense.currency_1))}</Text>
            </View>
          )}
          {wrappedStep === 3 && (
            <View style={{alignItems: 'center', width: '100%'}}>
              <Text style={{fontSize: 60}}>🏆</Text>
              <Text style={{color: '#fff', fontSize: 32, fontWeight: '900', textAlign: 'center', marginTop: 20, marginBottom: 20}}>Badges Earned</Text>
              <View style={{flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center'}}>
                {badges.map((b, i) => (
                  <View key={i} style={{alignItems: 'center', margin: 15, width: '35%'}}>
                    <Text style={{fontSize: 45}}>{b.icon}</Text>
                    <Text style={{color: '#fff', fontWeight: '900', fontSize: 14, marginTop: 8, textAlign: 'center'}}>{b.title}</Text>
                  </View>
                ))}
              </View>
              <Text style={{color: '#fff', fontSize: 16, marginTop: 50, opacity: 0.8}}>Tap to finish</Text>
            </View>
          )}
        </TouchableOpacity>
      </Modal>

      {/* Smart Trip Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{modalMode === 'add' ? 'New Trip' : 'Edit Trip'}</Text>
            
            <TextInput style={styles.modalInput} value={newTripName} onChangeText={setNewTripName} placeholder="Trip Name" placeholderTextColor="#94a3b8" />
            
            {/* 🚨 THE MODE SELECTOR (Moved up for better UX) 🚨 */}
            {modalMode === 'add' && (
              <View style={{backgroundColor: '#f1f5f9', borderRadius: 12, height: 50, justifyContent: 'center', marginBottom: 15}}>
                <Picker style={{color:'#000'}} selectedValue={tripStyle} onValueChange={setTripStyle}>
                  <Picker.Item label="Solo Tracker (Clean UI)" value="solo" />
                  <Picker.Item label="Group Trip (Splits & WhatsApp)" value="group" />
                  <Picker.Item label="Power User (Splits + Wallet Sync)" value="pro" />
                  <Picker.Item label="Trip Kitty (Shared Group Pot) 💰" value="kitty" />
                </Picker>
              </View>
            )}

            {/* 🚨 DYNAMIC INPUTS BASED ON MODE 🚨 */}
            {tripStyle === 'kitty' ? (
              <>
                <TextInput style={styles.modalInput} value={newTripBudget} onChangeText={setNewTripBudget} placeholder="Total Kitty Size (e.g. 30000)" placeholderTextColor="#94a3b8" keyboardType="numeric" />
                <TextInput style={styles.modalInput} value={kittyContributors} onChangeText={setKittyContributors} placeholder="Contributors (e.g. Rahul, Ajay)" placeholderTextColor="#94a3b8" />
              </>
            ) : (
              <TextInput style={styles.modalInput} value={newTripBudget} onChangeText={setNewTripBudget} placeholder="Personal Budget (Optional)" placeholderTextColor="#94a3b8" keyboardType="numeric" />
            )}

            <TextInput style={styles.modalInput} value={newTripDays} onChangeText={setNewTripDays} placeholder="Trip Duration in Days (Optional)" placeholderTextColor="#94a3b8" keyboardType="numeric" />
            
            <View style={styles.row}>
              <TouchableOpacity style={{flex: 1, padding: 15, borderRadius: 12, alignItems: 'center', marginHorizontal: 5, backgroundColor: '#ccc'}} onPress={() => setModalVisible(false)}><Text>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={{flex: 1, padding: 15, borderRadius: 12, alignItems: 'center', marginHorizontal: 5, backgroundColor: '#10b981'}} onPress={handleTripSave}><Text style={{color:'#fff', fontWeight: 'bold'}}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Settings Modal */}
      <Modal visible={settingsModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <Text style={styles.modalTitle}>⚙️ Settings</Text>
          <View style={[styles.rowBetween, {marginBottom: 20}]}>
            <Text style={{fontWeight: 'bold', color: '#1e293b'}}>Enable Split Features</Text>
            <Switch value={appSettings.showSplit} onValueChange={(val) => { const s = {...appSettings, showSplit: val}; setAppSettings(s); saveData(trips, activeTrip, masterCurrency, tripBudgets, tripDays, s); }} />
          </View>
          <View style={[styles.rowBetween, {marginBottom: 20}]}>
            <Text style={{fontWeight: 'bold', color: '#1e293b'}}>Enable Wallet Auto-Sync</Text>
            <Switch value={appSettings.showSync} onValueChange={(val) => { const s = {...appSettings, showSync: val}; setAppSettings(s); saveData(trips, activeTrip, masterCurrency, tripBudgets, tripDays, s); }} />
          </View>
          <TouchableOpacity style={{backgroundColor: '#10b981', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 15}} onPress={() => setSettingsModalVisible(false)}><Text style={{color:'#fff', fontWeight: 'bold'}}>Done</Text></TouchableOpacity>
        </View></View>
      </Modal>

      {/* Sync Wallet Modal */}
      <Modal visible={syncModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <Text style={styles.modalTitle}>⚖️ Sync Wallet</Text>
          <Text style={{fontSize: 12, color: '#64748b', marginBottom: 15, textAlign: 'center'}}>Enter the exact cash currently in your hand. We'll fix the math.</Text>
          <View style={{backgroundColor: '#f1f5f9', borderRadius: 12, height: 50, justifyContent: 'center', marginBottom: 15}}>
              <Picker style={{color:'#000'}} selectedValue={syncCurrency} onValueChange={setSyncCurrency}>
                {CURRENCIES.map(c => <Picker.Item key={c.value} label={c.label} value={c.value} />)}
              </Picker>
          </View>
          <TextInput style={styles.modalInput} value={syncAmount} onChangeText={setSyncAmount} placeholder="Actual Physical Amount" placeholderTextColor="#94a3b8" keyboardType="numeric" />
          <View style={styles.row}>
            <TouchableOpacity style={{flex: 1, padding: 15, borderRadius: 12, alignItems: 'center', marginHorizontal: 5, backgroundColor: '#ccc'}} onPress={() => setSyncModalVisible(false)}><Text>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={{flex: 1, padding: 15, borderRadius: 12, alignItems: 'center', marginHorizontal: 5, backgroundColor: '#10b981'}} onPress={handleWalletSync}><Text style={{color:'#fff', fontWeight: 'bold'}}>Sync</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      {/* Add/Edit Expense Modal */}
      <Modal visible={expenseModalVisible} animationType="slide" transparent>
        <View style={{flex:1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end'}}>
          <View style={{backgroundColor: '#f8fafc', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 20, maxHeight: '90%'}}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={[styles.rowBetween, {marginBottom: 15}]}>
                <Text style={{fontSize: 18, fontWeight: 'bold'}}>{editingId ? 'Edit Entry' : 'New Expense'}</Text>
                <TouchableOpacity onPress={() => setExpenseModalVisible(false)}><Text style={{fontSize: 24, color: 'red'}}>×</Text></TouchableOpacity>
              </View>

              <View style={styles.row}>
                <TouchableOpacity style={[styles.dateSelector, {flex: 1}]} onPress={() => setShowDatePicker(true)}>
                  <Text style={{color: '#000'}}>{isDateSelected ? `📅 ${dateObj.toLocaleDateString('en-GB')}` : '📅 Select Date'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.typeToggle, {backgroundColor: txType === 'Debit' ? '#fee2e2' : '#dcfce7'}]} onPress={() => setTxType(txType === 'Debit' ? 'Credit' : 'Debit')}><Text style={{color: txType === 'Debit' ? '#ef4444' : '#22c55e', fontWeight: 'bold'}}>{txType.toUpperCase()}</Text></TouchableOpacity>
              </View>
              {showDatePicker && (<DateTimePicker value={dateObj} mode="date" display="default" onChange={(e, d) => { setShowDatePicker(false); if(d) {setDateObj(d); setIsDateSelected(true);} }} />)}
              
              <View style={[styles.row, {marginTop:10}]}>
                <View style={styles.halfPicker}><Picker style={{color:'#000'}} selectedValue={country} onValueChange={setCountry}>
                  <Picker.Item label="Select Country" value="" />{LOCATIONS.map(l => <Picker.Item key={l.country} label={l.country} value={l.country} />)}
                </Picker></View>
                <View style={styles.halfPicker}><Picker style={{color:'#000'}} selectedValue={city} onValueChange={setCity}>
                  <Picker.Item label="Select City" value="" />{country ? LOCATIONS.find(l => l.country === country)?.cities.map(c => <Picker.Item key={c} label={c} value={c} />) : null}
                </Picker></View>
              </View>

              <TextInput style={[styles.input, {marginVertical: 10, color:'#000'}]} placeholder="Description" placeholderTextColor="#94a3b8" value={description} onChangeText={setDescription} />
              
              <View style={styles.row}>
                <View style={styles.halfPicker}><Picker style={{color:'#000'}} selectedValue={category} onValueChange={setCategory}>
                  <Picker.Item label="Select Category" value="" />{CATEGORIES.map(c => <Picker.Item key={c} label={c} value={c} />)}
                </Picker></View>
                <TextInput style={[styles.input, {flex: 1, color:'#000'}]} placeholder="Amount" placeholderTextColor="#94a3b8" keyboardType="numeric" value={amount1} onChangeText={setAmount1} />
              </View>

              {category === "🎟️ Other" && (<TextInput style={[styles.input, {marginTop: 10, borderColor:'#10b981', borderWidth:1, color:'#000'}]} placeholder="Describe other category..." placeholderTextColor="#94a3b8" value={customCategory} onChangeText={setCustomCategory} />)}

              <View style={[styles.row, {marginTop:10}]}>
                <View style={styles.halfPicker}><Picker style={{color:'#000'}} selectedValue={currency1} onValueChange={setCurrency1}>
                  <Picker.Item label="Select Currency" value="" />{CURRENCIES.map(c => <Picker.Item key={c.value} label={c.label} value={c.value} />)}
                </Picker></View>
                <View style={styles.halfPicker}><Picker style={{color:'#000'}} selectedValue={paymentMethod} onValueChange={setPaymentMethod}>
                  <Picker.Item label="Select Payment" value="" />{PAYMENTS.map(p => <Picker.Item key={p} label={p} value={p} />)}
                </Picker></View>
              </View>

              {appSettings.showSplit && (
                <>
                  <View style={[styles.rowBetween, {marginTop: 15}]}>
                    <Text style={{fontWeight:'bold', color:'#000'}}>Split with Friends?</Text>
                    <TouchableOpacity onPress={() => setIsSplit(!isSplit)} style={[styles.splitToggle, isSplit && {backgroundColor: '#3b82f6'}]}><Text style={{color: isSplit ? '#fff' : '#000'}}>👥 {isSplit ? 'YES' : 'NO'}</Text></TouchableOpacity>
                  </View>
                  {isSplit && <TextInput style={[styles.input, {marginTop: 10, color:'#000', borderColor: '#3b82f6', borderWidth: 1}]} placeholder="Names (e.g. Ajay, Rahul)" placeholderTextColor="#94a3b8" value={splitNames} onChangeText={setSplitNames} />}
                </>
              )}

              <TouchableOpacity style={[styles.submitBtn, {marginBottom: 40}]} onPress={handleSaveExpense}><Text style={styles.btnText}>{editingId ? 'UPDATE ENTRY' : '+ SAVE EXPENSE'}</Text></TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {currentTab === 'Home' ? renderHome() : currentTab === 'Charts' ? renderCharts() : currentTab === 'Guide' ? renderGuide() : renderFeatures()}

      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem} onPress={() => setCurrentTab('Home')}><Text style={[styles.tabIcon, currentTab === 'Home' && styles.activeTab]}>🏠</Text><Text style={[styles.tabText, currentTab === 'Home' && styles.activeTab]}>Home</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setCurrentTab('Charts')}><Text style={[styles.tabIcon, currentTab === 'Charts' && styles.activeTab]}>📊</Text><Text style={[styles.tabText, currentTab === 'Charts' && styles.activeTab]}>Charts</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setCurrentTab('Guide')}><Text style={[styles.tabIcon, currentTab === 'Guide' && styles.activeTab]}>📖</Text><Text style={[styles.tabText, currentTab === 'Guide' && styles.activeTab]}>Guide</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setCurrentTab('Features')}><Text style={[styles.tabIcon, currentTab === 'Features' && styles.activeTab]}>✨</Text><Text style={[styles.tabText, currentTab === 'Features' && styles.activeTab]}>Features</Text></TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { padding: 20, paddingTop: 45, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  appTitle: { fontSize: 20, fontWeight: '900', color: '#1e293b', textAlign: 'center' },
  homeCurrencyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 10 },
  currencyPickerWrapper: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 10, height: 40, justifyContent: 'center' },
  subText: { color: '#64748b', fontSize: 13, fontWeight: 'bold' },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  grandTotalText: { textAlign: 'center', fontSize: 16, fontWeight: '900', color: '#10b981', marginTop: 10 },
  tripPicker: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 10, height: 45, justifyContent: 'center' },
  iconBtn: { backgroundColor: '#f1f5f9', width: 45, height: 45, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  plusBtn: { backgroundColor: '#10b981', width: 45, height: 45, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  plusText: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  input: { backgroundColor: '#f1f5f9', borderRadius: 12, padding: 12, color: '#000' },
  dateSelector: { backgroundColor: '#f1f5f9', borderRadius: 12, padding: 15 },
  halfPicker: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 12, height: 50, justifyContent: 'center', marginRight: 5 },
  typeToggle: { paddingHorizontal: 15, height: 45, borderRadius: 12, justifyContent: 'center', marginLeft: 10 },
  splitToggle: { padding: 10, borderRadius: 10, backgroundColor: '#e2e8f0' },
  submitBtn: { backgroundColor: '#10b981', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 15 },
  exportBtn: { backgroundColor: '#3b82f6', padding: 15, borderRadius: 12, alignItems: 'center', margin: 15 },
  syncBtn: { backgroundColor: '#eef2ff', padding: 8, borderRadius: 8, alignItems: 'center', marginTop: 10, borderColor: '#c7d2fe', borderWidth: 1 },
  syncBtnText: { color: '#3b82f6', fontWeight: 'bold', fontSize: 12 },
  btnText: { color: '#fff', fontWeight: 'bold' },
  card: { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 15, marginBottom: 10, padding: 15, borderRadius: 16, borderLeftWidth: 5, borderColor: '#3b82f6', elevation: 2 },
  cardDate: { fontSize: 10, color: '#94a3b8' },
  cardDesc: { fontWeight: 'bold', fontSize: 15, color: '#1e293b', marginTop: 2 },
  cardCategory: { fontSize: 12, color: '#475569', marginTop: 2 },
  cardOrigAmt: { fontSize: 12, color: '#64748b', marginTop: 2 },
  cardAmt: { fontWeight: 'bold', fontSize: 18 },
  rateText: { fontSize: 10, color: '#10b981', fontWeight: 'bold', marginTop: 4 },
  splitSubText: { fontSize: 11, color: '#3b82f6', fontStyle: 'italic', fontWeight: 'bold', marginTop: 4 },
  summaryCardCompact: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#f1f5f9', padding: 10, borderRadius: 10, marginTop: 10 },
  legendText: { fontSize: 10, fontWeight: 'bold', color: '#1e293b' },
  budgetContainer: { marginTop: 10 },
  budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  budgetLabel: { fontSize: 11, fontWeight: 'bold', color: '#64748b' },
  paceMakerText: { fontSize: 11, fontWeight: 'bold', color: '#3b82f6', marginTop: 5, textAlign: 'center' },
  progressBarBg: { height: 10, backgroundColor: '#e2e8f0', borderRadius: 5, overflow: 'hidden' },
  progressBarFill: { height: '100%' },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', height: 95, borderTopWidth: 1, borderColor: '#e2e8f0', paddingBottom: 40 },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabIcon: { fontSize: 22, color: '#94a3b8' },
  tabText: { fontSize: 10, fontWeight: 'bold', color: '#64748b' },
  activeTab: { color: '#3b82f6' },
  summaryCard: { backgroundColor: '#fff', padding: 20, borderRadius: 20, elevation: 3, marginBottom: 15 },
  summaryTitle: { fontWeight: 'bold', marginBottom: 15, color: '#1e293b', fontSize: 16 },
  featureListText: { fontSize: 12, color: '#64748b', marginBottom: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#fff', padding: 25, borderRadius: 25, width: '85%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: '#000' },
  modalInput: { backgroundColor: '#f1f5f9', padding: 15, borderRadius: 12, marginBottom: 15, color: '#000' },
  fab: { position: 'absolute', bottom: 20, right: 20, backgroundColor: '#10b981', width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 },
  fabText: { color: '#fff', fontSize: 32, fontWeight: 'bold', marginTop: -2 }
});
