import 'dart:io';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:camera/camera.dart'; 
import '../main.dart'; 
import 'selection_screen.dart'; 
import 'package:flutter/foundation.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'dart:io';

class CameraScreen extends StatefulWidget {
  final List<String> shooterNames;
  final bool isVongLoai; 
  final int vlDanBia;
  final int vlTongDan;
  final int vtXaThu;
  final int vtDanBia;
  final int vtVongLoai;
  final int vtChuKyLoai;
  final String loaiBia;

  const CameraScreen({
    super.key, 
    required this.shooterNames,
    this.isVongLoai = true, 
    required this.vtChuKyLoai,
    required this.vlDanBia, required this.vlTongDan,
    required this.vtXaThu, required this.vtDanBia, required this.vtVongLoai,
    required this.loaiBia,
  });

  @override
  State<CameraScreen> createState() => _CameraScreenState();
}

class _CameraScreenState extends State<CameraScreen> {
  int _currentIndex = 0;
  int _currentTurn = 1;
  final Map<String, bool> _hasScore = {};
  final List<int> _eliminatedIndices = []; 

  CameraController? _cameraController; 
  XFile? _capturedImage;
  final TextEditingController _manualScoreController = TextEditingController();

  final String apiUrl = "https://script.google.com/macros/s/AKfycbxCDXzxdoqxIbSNbGxGZ1aHpI7x47Iha5kRXyjj_wdyAT_UH2tbo_pTDe9TIDKMN_04Ug/exec";
  // Thay thế URL cố định bằng biến tự động
  String serverIp = ""; 
  bool isSearchingServer = true; // Trạng thái đang quét mạng

  String get aiApiUrl => "http://$serverIp:8000/analyze-target";

  String get _roundName => widget.isVongLoai ? "VÒNG LOẠI" : "VÒNG TRONG";
  int get _currentDanBia => widget.isVongLoai ? widget.vlDanBia : widget.vtDanBia;
  String get _targetType => widget.loaiBia.toUpperCase().contains('TRƯỜNG') ||
          widget.loaiBia.toUpperCase().contains('NHỎ')
      ? 'air_rifle_10m'
      : 'air_pistol_10m';
  
  int get _maxTurn => widget.isVongLoai ? ((widget.vlDanBia > 0) ? (widget.vlTongDan ~/ widget.vlDanBia) : 1) : 99;

  @override
  void initState() {
    super.initState();
    _initCamera();
    _scanNetworkForServer();
  }

  Future<void> _initCamera() async {
    if (cameras.isEmpty) return;
    _cameraController = CameraController(cameras[0], ResolutionPreset.high, enableAudio: false); 
    await _cameraController!.initialize();
    await _cameraController!.setZoomLevel(2.0);
    await _cameraController!.setFlashMode(FlashMode.off);
    if (mounted) {
      setState(() {});
    }
  }

  Future<void> _scanNetworkForServer() async {
    setState(() { isSearchingServer = true; });
    try {
      String? subnet;
      // 1. Lấy dải mạng hiện tại của điện thoại (VD: 192.168.1.x)
      for (var interface in await NetworkInterface.list()) {
        for (var addr in interface.addresses) {
          if (addr.type == InternetAddressType.IPv4 && !addr.isLoopback) {
            String ip = addr.address;
            subnet = ip.substring(0, ip.lastIndexOf('.'));
            break;
          }
        }
        if (subnet != null) break;
      }

      // 2. Bắn 255 gói tin dò tìm đồng loạt (chỉ mất ~1.5 giây)
      if (subnet != null) {
        List<Future<void>> scanTasks = [];
        for (int i = 1; i < 255; i++) {
          String testIp = "$subnet.$i";
          scanTasks.add(_pingServer(testIp));
        }
        await Future.wait(scanTasks); // Chờ tất cả quét xong
      }
    } catch (e) {
      debugPrint("Lỗi lấy IP mạng: $e");
    }
    
    // 3. Kết thúc quét
    setState(() { isSearchingServer = false; });
    
    if (serverIp.isEmpty && mounted) {
       ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('⚠️ Không tìm thấy Macbook! Hãy kiểm tra lại kết nối Wifi.'), backgroundColor: Colors.red, duration: Duration(seconds: 4)),
      );
    } else {
       ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('✅ Đã kết nối AI Server: $serverIp'), backgroundColor: Colors.green),
      );
    }
  }

  // Hàm con: Gõ cửa từng nhà xem ai là Server
  Future<void> _pingServer(String ip) async {
    if (serverIp.isNotEmpty) return; // Nếu đã tìm thấy rồi thì ngừng gõ cửa nhà khác
    try {
      // Cho thời gian chờ tối đa 1.5 giây
      var response = await http.get(Uri.parse("http://$ip:8000/ping"))
          .timeout(const Duration(milliseconds: 1500));
          
      // Nếu trả lời đúng mật khẩu thì lấy luôn IP này
      if (response.statusCode == 200 && response.body.contains("cham_diem_ai")) {
        serverIp = ip;
      }
    } catch (e) {
      // Bị từ chối (không phải server) -> Bỏ qua
    }
  }

  void _resetCamera() {
    setState(() { _capturedImage = null; });
  }

  @override
  void dispose() {
    _cameraController?.dispose();
    _manualScoreController.dispose();
    super.dispose();
  }

  
  Future<Map<String, dynamic>?> _analyzeImageWithAI(File imageFile) async {
      try {
        // --- CẬP NHẬT: NÉN ẢNH SIÊU NHẸ TRƯỚC KHI GỬI ---
        File? compressedFile = await compressImage(imageFile);
        if (compressedFile != null) {
          imageFile = compressedFile; // Ghi đè file gốc bằng file đã nén (chỉ khoảng 100-300KB)
        }
        // ------------------------------------------------
        
        var request = http.MultipartRequest('POST', Uri.parse(aiApiUrl));
        request.files.add(await http.MultipartFile.fromPath('file', imageFile.path));
        request.fields['shots_per_target'] = _currentDanBia.toString();
        request.fields['target_type'] = _targetType;
        var streamedResponse = await request.send();
        var response = await http.Response.fromStream(streamedResponse);
        if (response.statusCode == 200) return jsonDecode(response.body); 
      } catch (e) { debugPrint("Lỗi kết nối AI: $e"); }
      return null;
  }

    
  // --- ĐÃ SỬA: Hàm chụp ảnh thủ công ---
  Future<void> _takePhotoAndScore() async {
    if (_cameraController == null || !_cameraController!.value.isInitialized) return;
    if (serverIp.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Chưa kết nối được Server AI! Đang tìm kiếm...'), backgroundColor: Colors.red));
      _scanNetworkForServer(); // Gọi quét lại
      return;
    }

    try {
      XFile photo = await _cameraController!.takePicture();
      setState(() { _capturedImage = photo; });
      
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => const Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircularProgressIndicator(color: Color(0xFFD68910)),
              SizedBox(height: 15),
              Text("AI đang chấm điểm...", style: TextStyle(color: Colors.white, fontSize: 16)),
            ],
          ),
        ),
      );

      Map<String, dynamic>? aiResult = await _analyzeImageWithAI(File(photo.path));
      if (!mounted) return;
      Navigator.pop(context);

      List<double> individualScores = [];
      double totalScore = 0.0;

      if (aiResult != null && aiResult['status'] == 'success') {
        individualScores = (aiResult['scores'] as List).map((e) => (e as num).toDouble()).toList();
        totalScore = (aiResult['total_score'] as num).toDouble();
        _showScoreInputDialog(individualScores, totalScore);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('⚠️ AI không nhận diện được, vui lòng nhập tay!'), backgroundColor: Colors.orange),
        );
        FocusScope.of(context).requestFocus(FocusNode());
        _resetCamera(); 
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Lỗi: $e'), backgroundColor: Colors.red));
      _resetCamera();
    }
  }

  void _showScoreInputDialog(List<double> individualScores, double totalScore) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: const Text('🎯 Điểm số AI Chấm', textAlign: TextAlign.center, style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.black)),
          content: SizedBox(
            width: double.maxFinite,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text("Tổng điểm: $totalScore", style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.red)),
                const Divider(color: Colors.grey),
                Flexible(
                  child: ListView.builder(
                    shrinkWrap: true,
                    itemCount: individualScores.length,
                    itemBuilder: (context, index) {
                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4.0),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceAround,
                          children: [
                            Text("Viên ${index + 1}", style: const TextStyle(fontSize: 16, color: Colors.black)),
                            Text("${individualScores[index]}", style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.black)),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
          actionsAlignment: MainAxisAlignment.spaceEvenly,
          actions: [
            TextButton(
              onPressed: () {
                 Navigator.pop(context);
                 _manualScoreController.clear();
                 _resetCamera(); 
              },
              child: const Text("HỦY (Tự nhập)", style: TextStyle(color: Colors.grey, fontWeight: FontWeight.bold)),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: Colors.green),
              onPressed: () {
                Navigator.pop(context);
                setState(() {
                  _manualScoreController.text = totalScore.toString();
                });
                _resetCamera(); 
              },
              child: const Text("ĐỒNG Ý ĐIỂM", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            ),
          ],
        );
      },
    );
  }

  Future<File?> compressImage(File file) async {
  final filePath = file.absolute.path;
  final lastIndex = filePath.lastIndexOf(RegExp(r'.jp?g|.png'));
  final splitted = filePath.substring(0, (lastIndex));
  final outPath = "${splitted}_out${filePath.substring(lastIndex)}";

  var result = await FlutterImageCompress.compressAndGetFile(
    file.absolute.path, 
    outPath,
    quality: 70, // Giữ độ nét 70% (đủ sắc nét cho AI nhận diện)
    minWidth: 1080, // Giới hạn chiều rộng tối đa 1080px (đủ cho AI)
    minHeight: 1080,
  );

  return result != null ? File(result.path) : null;
}

  Future<void> _submitScore() async {
    String score = _manualScoreController.text.trim();
    if (score.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Vui lòng nhập điểm!'), backgroundColor: Colors.red));
      return;
    }

    // 1. LƯU LẠI INDEX HIỆN TẠI ĐỂ GỬI API NGẦM
    int oldIndex = _currentIndex;
    int submittedTurn = _currentTurn;
    String currentShooterName = widget.shooterNames[oldIndex];

    // 2. CẬP NHẬT UI NGAY LẬP TỨC (Ẩn Turn, xóa điểm, reset camera)
    setState(() {
      _hasScore["${_currentTurn}_$oldIndex"] = true;
      _manualScoreController.clear();

      // Thuật toán: Tự động nhảy sang Turn tiếp theo của CÙNG xạ thủ này
      int nextTurn = _currentTurn;
      int maxT = widget.isVongLoai ? _maxTurn : 20;
      for (int i = 1; i <= maxT; i++) {
        if (!(_hasScore["${i}_$oldIndex"] ?? false)) {
          nextTurn = i;
          break;
        }
      }
      _currentTurn = nextTurn;
    });
    
    _resetCamera(); // Tắt ảnh vừa chụp ngay lập tức

    // 3. GỬI DỮ LIỆU LÊN GOOGLE SHEET CHẠY NGẦM (Không bắt UI chờ)
    try {
      var response = await http.post(
        Uri.parse(apiUrl),
        body: {
          "vong": _roundName,
          "turn": submittedTurn.toString(),
          "name": currentShooterName,
          "score": score,
        },
      );

      if (response.statusCode == 200) {
        // --- THUẬT TOÁN BẬT BẢNG LOẠI TRỰC TIẾP GIỮ NGUYÊN Ở ĐÂY ---
        if (!widget.isVongLoai) {
          bool isTurnComplete = true;
          int activeCount = 0;
          for (int i = 0; i < widget.shooterNames.length; i++) {
            if (!_eliminatedIndices.contains(i)) {
              activeCount++;
              if (!(_hasScore["${_currentTurn}_$i"] ?? false)) isTurnComplete = false;
            }
          }

          if (isTurnComplete && activeCount > 2) {
            int totalShotsFired = _currentTurn * widget.vtDanBia;
            if (widget.vtChuKyLoai > 0 && totalShotsFired > widget.vtVongLoai && 
               (totalShotsFired - widget.vtVongLoai) % widget.vtChuKyLoai == 0) {
              Future.delayed(const Duration(seconds: 1), () => _showEliminateDialog());
            }
          }
        }
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('❌ Lỗi lưu ngầm: $e'), backgroundColor: Colors.red));
    }
  }

  void _endAndResetTournament() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text("KẾT THÚC GIẢI ĐẤU"),
        content: const Text("Thao tác này sẽ XÓA TOÀN BỘ dữ liệu trên Google Sheet và đưa bạn về màn hình chọn bia ban đầu. Bạn có chắc chắn không?"),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text("HỦY")),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () {
              // 1. Đóng bảng hỏi ngay lập tức
              Navigator.pop(context); 

              // 2. GỬI LỆNH XÓA NGẦM LÊN GOOGLE SHEET (Bỏ 'await' để ứng dụng không bị treo chờ)
              http.post(Uri.parse(apiUrl), body: {"action": "clear"}).catchError((e) {
                debugPrint("Lỗi xóa ngầm: $e");
              });

              // 3. Thông báo nhanh cho người dùng
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('⚡ Đã reset giải đấu & đang xóa dữ liệu ngầm!'),
                  backgroundColor: Colors.green,
                  duration: Duration(seconds: 2),
                ),
              );

              // 4. QUAY VỀ MÀN HÌNH ĐẦU TIÊN (Màn hình chọn bia / Main)
              Navigator.popUntil(context, (route) => route.isFirst);
            },
            child: const Text("XÓA DỮ LIỆU & RESET", style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _showEliminateDialog() {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text("Xác nhận loại Xạ thủ"),
          content: SizedBox(
            width: double.maxFinite,
            child: ListView.builder(
              shrinkWrap: true,
              itemCount: widget.shooterNames.length,
              itemBuilder: (context, index) {
                bool isEliminated = _eliminatedIndices.contains(index);
                if (isEliminated) return const SizedBox.shrink(); 
                return ListTile(
                  title: Text(widget.shooterNames[index]),
                  trailing: const Icon(Icons.close, color: Colors.red),
                  onTap: () {
                    setState(() { _eliminatedIndices.add(index); });
                    Navigator.pop(context);
                  },
                );
              },
            ),
          ),
        );
      },
    );
  }

  void _selectShooter() {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text("Chọn Xạ thủ", style: TextStyle(fontWeight: FontWeight.bold)),
          content: SizedBox(
            width: double.maxFinite,
            child: ListView.builder(
              shrinkWrap: true,
              itemCount: widget.shooterNames.length,
              itemBuilder: (context, index) {
                bool isEliminated = _eliminatedIndices.contains(index);
                if (isEliminated) return const SizedBox.shrink(); 
                
                return ListTile(
                  title: Text(
                    "${index + 1}. ${widget.shooterNames[index]}",
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: _currentIndex == index ? FontWeight.bold : FontWeight.normal,
                      color: _currentIndex == index ? Colors.orange : Colors.black,
                    ),
                  ),
                  trailing: _currentIndex == index ? const Icon(Icons.check_circle, color: Colors.orange) : null,
                  onTap: () {
                    setState(() { 
                      _currentIndex = index;
                      
                      // Khi đổi người, tự động tìm Turn đầu tiên chưa bắn của người này
                      int nextTurn = 1;
                      int maxT = widget.isVongLoai ? _maxTurn : 20;
                      for (int i = 1; i <= maxT; i++) {
                         if (!(_hasScore["${i}_$_currentIndex"] ?? false)) {
                             nextTurn = i;
                             break;
                         }
                      }
                      _currentTurn = nextTurn;
                    });
                    Navigator.pop(context);
                    _resetCamera();
                  },
                );
              },
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    bool isBiaNho = widget.loaiBia.toUpperCase().contains('TRƯỜNG') || 
                    widget.loaiBia.toUpperCase().contains('NHỎ');
    return GestureDetector(
      onTap: () => FocusScope.of(context).unfocus(), // THÊM DÒNG NÀY
      child: Scaffold(
        backgroundColor: const Color(0xFF172C19),
        appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        iconTheme: const IconThemeData(color: Colors.white),
        title: GestureDetector(
          onTap: _selectShooter,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(color: Colors.black45, borderRadius: BorderRadius.circular(20)),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Flexible(
                  child: Text(
                    '$_roundName - ${widget.shooterNames[_currentIndex]}', 
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                const Icon(Icons.arrow_drop_down_circle, color: Colors.orange, size: 20),
              ],
            ),
          ),
        ),
        actions: [
          if (widget.isVongLoai)
            IconButton(
              icon: const Icon(Icons.stop_circle, color: Colors.red, size: 34),
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => SelectionScreen(
                      allShooters: widget.shooterNames,
                      vtXaThu: widget.vtXaThu,
                      vtDanBia: widget.vtDanBia,
                      vtVongLoai: widget.vtVongLoai,
                      vtChuKyLoai: widget.vtChuKyLoai,
                      loaiBia: widget.loaiBia,
                    ),
                  ),
                );
              },
            ),
            
          if (!widget.isVongLoai && _currentTurn > widget.vtVongLoai)
            IconButton(
              icon: const Icon(Icons.person_remove, color: Colors.orange, size: 30),
              tooltip: "Loại bớt xạ thủ",
              onPressed: _showEliminateDialog,
            ),
          
          if (!widget.isVongLoai)
            IconButton(
              icon: const Icon(Icons.delete_forever, color: Colors.redAccent, size: 30),
              tooltip: "Kết thúc giải & Reset",
              onPressed: _endAndResetTournament,
            ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.black, borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.orange, width: 2), 
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(18),
                child: _cameraController != null && _cameraController!.value.isInitialized
                    ? Stack(
                        fit: StackFit.expand,
                        children: [
                          CameraPreview(_cameraController!),
                          // === KHUNG CANH HÌNH THÔNG MINH MỚI ===
                          // === KHUNG CANH HÌNH VUÔNG CHUẨN KÍCH THƯỚC BIA (KHOẢNG CÁCH 20CM) ===
                          Center(
                            child: LayoutBuilder(
                              builder: (context, constraints) {
                                double baseWidth = constraints.maxWidth;
                                double squareSize;
                                Color guideColor = Colors.orangeAccent;

                                if (isBiaNho) {
                                  // Bia súng trường nhỏ (80mm x 80mm) ở khoảng cách 20cm
                                  squareSize = baseWidth * 0.82; 
                                } else {
                                  // Bia súng ngắn lớn (170mm x 170mm) ở khoảng cách 20cm
                                  squareSize = baseWidth * 0.82; 
                                }

                                return CustomPaint(
                                  // Ép cả Width và Height bằng squareSize để tạo HÌNH VUÔNG 100%
                                  size: Size(squareSize, squareSize), 
                                  painter: TargetGuidePainter(
                                    color: guideColor,
                                    isPistol: !isBiaNho,
                                  ), 
                                );
                              },
                            ),
                          ),
                          if (_capturedImage != null)
                             Image.file(File(_capturedImage!.path), fit: BoxFit.cover),
                             
                          // --- ĐÃ THÊM: Nút chụp ảnh nổi bọt (Chỉ hiện khi chưa chụp) ---
                          if (_capturedImage == null)
                            Align(
                              alignment: Alignment.bottomCenter,
                              child: Padding(
                                padding: const EdgeInsets.only(bottom: 20),
                                child: GestureDetector(
                                  onTap: _takePhotoAndScore,
                                  child: Container(
                                    height: 70,
                                    width: 70,
                                    decoration: BoxDecoration(
                                      color: Colors.white,
                                      shape: BoxShape.circle,
                                      border: Border.all(color: Colors.orange, width: 4),
                                    ),
                                    child: const Icon(Icons.camera_alt, color: Colors.black, size: 35),
                                  ),
                                ),
                              ),
                            ),
                        ],
                      )
                    : const Center(child: CircularProgressIndicator(color: Colors.orange)),
              ),
            ),
          ),

          Container(
            height: 90,
            margin: const EdgeInsets.only(bottom: 15),
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              // Vòng loại dùng _maxTurn, Vòng trong cho phép tối đa 20 Turn
              itemCount: widget.isVongLoai ? _maxTurn : 20, 
              itemBuilder: (context, index) {
                int turnNum = index + 1;
                bool isSelected = turnNum == _currentTurn;
                // Kiểm tra xem xạ thủ HIỆN TẠI đã có điểm ở Turn này chưa
                bool isDone = _hasScore["${turnNum}_$_currentIndex"] ?? false; 
                
                return GestureDetector(
                  onTap: () { 
                    setState(() { _currentTurn = turnNum; }); 
                    _resetCamera(); 
                  },
                  child: Stack(
                    children: [
                      Container(
                        width: 90,
                        margin: const EdgeInsets.only(right: 10, top: 10),
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: isSelected ? const Color(0xFFD68910) : const Color(0xFFB0B0B0),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Center(
                          child: Text(
                            'TURN $turnNum',
                            textAlign: TextAlign.center, 
                            style: const TextStyle(color: Colors.black, fontWeight: FontWeight.bold, fontSize: 16),
                          ),
                        ),
                      ),
                      if (isDone)
                        const Positioned(
                          top: 0, right: 5,
                          child: CircleAvatar(radius: 12, backgroundColor: Colors.white, child: Icon(Icons.check_circle, color: Colors.green, size: 24)),
                        ),
                    ],
                  ),
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
            child: Row(
              children: [
                Expanded(
                  flex: 3,
                  child: Container(
                    height: 60,
                    decoration: BoxDecoration(color: const Color(0xFFE0E0E0), borderRadius: BorderRadius.circular(12)),
                    child: TextField(
                      controller: _manualScoreController,
                      textInputAction: TextInputAction.done,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.black),
                      decoration: const InputDecoration(border: InputBorder.none, hintText: "Điểm", hintStyle: TextStyle(color: Colors.grey, fontSize: 18)),
                    ),
                  ),
                ),
                const SizedBox(width: 15),
                Expanded(
                  flex: 7,
                  child: SizedBox(
                    height: 60,
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFD68910),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: _submitScore,
                      icon: const Icon(Icons.check_circle, color: Colors.black),
                      label: const Text('Xác nhận & Lưu', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.black)),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
    );
  }
}
/// =========================================================
// CUSTOM PAINTER VẼ KHUNG VUÔNG 4 GÓC (TỰ ĐỘNG THEO TỈ LỆ)
// =========================================================
class TargetGuidePainter extends CustomPainter {
  final Color color;
  final bool isPistol;

  TargetGuidePainter({required this.color, required this.isPistol});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3;

    // Chiều dài nét vẽ ở 4 góc tự động chiếm 20% cạnh hình vuông
    double cornerLength = size.width * 0.20;

    final w = size.width;
    final h = size.height;

    // 1. Góc trên - trái
    canvas.drawLine(const Offset(0, 0), Offset(cornerLength, 0), paint); 
    canvas.drawLine(const Offset(0, 0), Offset(0, cornerLength), paint); 

    // 2. Góc trên - phải
    canvas.drawLine(Offset(w, 0), Offset(w - cornerLength, 0), paint);
    canvas.drawLine(Offset(w, 0), Offset(w, cornerLength), paint);

    // 3. Góc dưới - trái
    canvas.drawLine(Offset(0, h), Offset(cornerLength, h), paint);
    canvas.drawLine(Offset(0, h), Offset(0, h - cornerLength), paint);

    // 4. Góc dưới - phải
    canvas.drawLine(Offset(w, h), Offset(w - cornerLength, h), paint);
    canvas.drawLine(Offset(w, h), Offset(w, h - cornerLength), paint);
  }

  @override
  bool shouldRepaint(CustomPainter oldDelegate) => false;
}
