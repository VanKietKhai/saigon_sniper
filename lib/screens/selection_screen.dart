import 'package:flutter/material.dart';
import 'camera_screen.dart';

class SelectionScreen extends StatefulWidget {
  final List<String> allShooters;
  final int vtXaThu;
  final int vtDanBia;
  final int vtVongLoai;
  final int vtChuKyLoai;
  final String loaiBia;

  const SelectionScreen({
    super.key, required this.allShooters, required this.vtXaThu,
    required this.vtDanBia, required this.vtVongLoai, required this.vtChuKyLoai, required this.loaiBia,
  });

  @override
  State<SelectionScreen> createState() => _SelectionScreenState();
}

class _SelectionScreenState extends State<SelectionScreen> {
  final List<String> _selectedShooters = [];

  void _toggleSelection(String name) {
    setState(() {
      if (_selectedShooters.contains(name)) {
        _selectedShooters.remove(name);
      } else {
        if (_selectedShooters.length < widget.vtXaThu) {
          _selectedShooters.add(name);
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Chỉ được chọn tối đa ${widget.vtXaThu} xạ thủ!'), backgroundColor: Colors.red),
          );
        }
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    bool isFull = _selectedShooters.length == widget.vtXaThu;

    return Scaffold(
      backgroundColor: const Color(0xFF172C19),
      appBar: AppBar(title: const Text('CHỌN XẠ THỦ VÒNG TRONG')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Text('Đã chọn: ${_selectedShooters.length} / ${widget.vtXaThu}', 
                style: const TextStyle(fontSize: 20, color: Colors.orange, fontWeight: FontWeight.bold)),
          ),
          Expanded(
            child: ListView.builder(
              itemCount: widget.allShooters.length,
              itemBuilder: (context, index) {
                String name = widget.allShooters[index];
                bool isSelected = _selectedShooters.contains(name);
                return ListTile(
                  title: Text(name, style: const TextStyle(color: Colors.white, fontSize: 18)),
                  trailing: isSelected 
                      ? const Icon(Icons.check_box, color: Colors.green, size: 30)
                      : const Icon(Icons.check_box_outline_blank, color: Colors.grey, size: 30),
                  onTap: () => _toggleSelection(name),
                );
              },
            ),
          ),
          if (isFull)
            Padding(
              padding: const EdgeInsets.all(20.0),
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.orange,
                  minimumSize: const Size(double.infinity, 50),
                ),
                onPressed: () {
                  // MỞ LẠI CAMERA NHƯNG ĐÁNH DẤU LÀ VÒNG TRONG
                  Navigator.pushReplacement(
                    context,
                    MaterialPageRoute(
                      builder: (context) => CameraScreen(
                        shooterNames: _selectedShooters,
                        isVongLoai: false, // <-- QUAN TRỌNG: Báo cho Camera biết là đang bắn Vòng Trong
                        vlDanBia: 0, vlTongDan: 0, // Không dùng tới nữa
                        vtXaThu: widget.vtXaThu,
                        vtDanBia: widget.vtDanBia,
                        vtVongLoai: widget.vtVongLoai,
                        vtChuKyLoai: widget.vtChuKyLoai,
                        loaiBia: widget.loaiBia,
                      ),
                    ),
                  );
                },
                child: const Text('BẮT ĐẦU VÒNG TRONG', style: TextStyle(fontSize: 18, color: Colors.black, fontWeight: FontWeight.bold)),
              ),
            ),
        ],
      ),
    );
  }
}